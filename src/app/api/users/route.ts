import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import {
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
  replaceUserPasswordGrants,
} from "@/lib/document-access";
import {
  AUDIT_ACTION_USER_CREATED,
  AUDIT_STATUS_SUCCESS,
  BCRYPT_SALT_ROUNDS,
  DEFAULT_USER_ROLE,
  parseCreateUserPayload,
} from "@/lib/user-creation";

function unauthorizedResponse() {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}

async function getAdminSession() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "ADMIN" ? session : null;
}

function sanitizeUser<T extends { password: string; twoFactorSecret: string | null }>(user: T) {
  const { password: _password, twoFactorSecret: _twoFactorSecret, ...safeUser } = user;
  void _password;
  void _twoFactorSecret;
  return safeUser;
}

async function validateWorkspaceIds(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return true;

  const existingWorkspaces = await prisma.workspace.count({
    where: { id: { in: workspaceIds } },
  });

  return existingWorkspaces === workspaceIds.length;
}

/**
 * Lista usuarios para el módulo administrativo sin exponer credenciales sensibles.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return unauthorizedResponse();

  const users = await prisma.user.findMany({
    include: {
      workspaces: true,
      documentPasswordGrants: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users.map(sanitizeUser));
}

/**
 * Crea un perfil operativo administrado.
 * Requiere una sesión ADMIN, valida el payload antes de persistir, aplica hash bcrypt,
 * asocia workspaces/grants y registra el evento USER_CREATED.
 * Nunca devuelve password ni twoFactorSecret.
 */
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return unauthorizedResponse();

  try {
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json({ error: "El cuerpo JSON de la solicitud no es válido." }, { status: 400 });
    }

    const parsedPayload = parseCreateUserPayload(requestBody);
    if (!parsedPayload.ok) {
      return NextResponse.json({ error: parsedPayload.error }, { status: 400 });
    }

    const {
      name,
      email,
      password,
      accessRole,
      workspaceIds,
      documentAccessMode,
      passwordGrantKeys,
    } = parsedPayload.value;

    const [existingUser, validWorkspaces] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      validateWorkspaceIds(workspaceIds),
    ]);

    if (existingUser) {
      return NextResponse.json({ error: "El email ya está registrado." }, { status: 409 });
    }

    if (!validWorkspaces) {
      return NextResponse.json({ error: "Uno o más espacios de trabajo no existen." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: DEFAULT_USER_ROLE,
        accessRole,
        documentAccessMode,
        workspaces: {
          connect: workspaceIds.map((id: string) => ({ id })),
        },
      },
      include: {
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    if (accessRole === ACCESS_ROLE_WEB_VIEWER && documentAccessMode === DOCUMENT_ACCESS_PASSWORD_SCOPED) {
      await replaceUserPasswordGrants(newUser.id, workspaceIds, passwordGrantKeys);
    }

    const userWithGrants = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: {
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: AUDIT_ACTION_USER_CREATED,
        details: `Empleado creado: ${name} (${email}), Rol: ${DEFAULT_USER_ROLE}, Tipo: ${accessRole}, Espacios: ${workspaceIds.length}, Visor: ${documentAccessMode}`,
        status: AUDIT_STATUS_SUCCESS,
      },
    });

    return NextResponse.json(sanitizeUser(userWithGrants || newUser), { status: 201 });
  } catch (error) {
    console.error("[RF-01] Error al crear usuario", {
      actorUserId: session.user.id,
      error,
    });

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "El email ya está registrado." }, { status: 409 });
    }

    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
