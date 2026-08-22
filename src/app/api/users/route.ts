import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import {
  ACCESS_ROLE_DESKTOP_SCANNER,
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_GLOBAL,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
  replaceUserPasswordGrants,
} from "@/lib/document-access";

const BCRYPT_SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;
const DEFAULT_USER_ROLE = "EMPLOYEE";
const AUDIT_ACTION_USER_CREATED = "USER_CREATED";
const AUDIT_STATUS_SUCCESS = "SUCCESS";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  accessRole: typeof ACCESS_ROLE_WEB_VIEWER | typeof ACCESS_ROLE_DESKTOP_SCANNER;
  workspaceIds: string[];
  documentAccessMode: typeof DOCUMENT_ACCESS_GLOBAL | typeof DOCUMENT_ACCESS_PASSWORD_SCOPED;
  passwordGrantKeys: string[];
};

type ParseResult =
  | { ok: true; value: CreateUserPayload }
  | { ok: false; error: string };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(
  value: unknown,
  fieldName: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: [] };

  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim().length > 0)) {
    return { ok: false, error: `${fieldName} debe ser una lista de identificadores válidos.` };
  }

  return { ok: true, value: [...new Set(value.map(item => item.trim()))] };
}

function parseCreateUserPayload(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: "El cuerpo de la solicitud no es válido." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "El correo electrónico no es válido." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }

  const accessRole = input.accessRole ?? ACCESS_ROLE_DESKTOP_SCANNER;
  if (accessRole !== ACCESS_ROLE_WEB_VIEWER && accessRole !== ACCESS_ROLE_DESKTOP_SCANNER) {
    return { ok: false, error: "El tipo de cuenta no es válido." };
  }

  const documentAccessMode = input.documentAccessMode ?? DOCUMENT_ACCESS_PASSWORD_SCOPED;
  if (documentAccessMode !== DOCUMENT_ACCESS_GLOBAL && documentAccessMode !== DOCUMENT_ACCESS_PASSWORD_SCOPED) {
    return { ok: false, error: "El modo de acceso documental no es válido." };
  }

  const workspaceIds = parseStringArray(input.workspaceIds, "workspaceIds");
  if (!workspaceIds.ok) return workspaceIds;

  const passwordGrantKeys = parseStringArray(input.passwordGrantKeys, "passwordGrantKeys");
  if (!passwordGrantKeys.ok) return passwordGrantKeys;

  return {
    ok: true,
    value: {
      name,
      email,
      password,
      accessRole,
      workspaceIds: workspaceIds.value,
      documentAccessMode,
      passwordGrantKeys: passwordGrantKeys.value,
    },
  };
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
    const parsedPayload = parseCreateUserPayload(await request.json());
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
          connect: workspaceIds.map(id => ({ id })),
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
