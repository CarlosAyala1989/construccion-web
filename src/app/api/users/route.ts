import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  ACCESS_ROLE_DESKTOP_SCANNER,
  ACCESS_ROLE_WEB_VIEWER,
  DOCUMENT_ACCESS_GLOBAL,
  DOCUMENT_ACCESS_PASSWORD_SCOPED,
  replaceUserPasswordGrants,
} from "@/lib/document-access";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    include: {
      workspaces: true,
      documentPasswordGrants: true,
    },
    orderBy: { createdAt: "desc" }
  });
  
  // Return users without passwords
  const safeUsers = users.map(user => {
    const { password, twoFactorSecret, ...safeUser } = user;
    void password;
    void twoFactorSecret;
    return safeUser;
  });

  return NextResponse.json(safeUsers);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const {
      name,
      email,
      password,
      role,
      accessRole,
      workspaceIds = [],
      documentAccessMode,
      passwordGrantKeys = [],
    } = data;
    const nextAccessRole = accessRole === ACCESS_ROLE_WEB_VIEWER ? ACCESS_ROLE_WEB_VIEWER : ACCESS_ROLE_DESKTOP_SCANNER;
    const accessMode =
      documentAccessMode === DOCUMENT_ACCESS_GLOBAL ? DOCUMENT_ACCESS_GLOBAL : DOCUMENT_ACCESS_PASSWORD_SCOPED;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "El email ya está registrado." }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "EMPLOYEE",
        accessRole: nextAccessRole,
        documentAccessMode: accessMode,
        workspaces: {
          connect: workspaceIds?.map((id: string) => ({ id })) || []
        }
      },
      include: {
        workspaces: true,
        documentPasswordGrants: true,
      }
    });

    if (nextAccessRole === ACCESS_ROLE_WEB_VIEWER && accessMode === DOCUMENT_ACCESS_PASSWORD_SCOPED) {
      await replaceUserPasswordGrants(newUser.id, workspaceIds, passwordGrantKeys);
    }

    const userWithGrants = await prisma.user.findUnique({
      where: { id: newUser.id },
      include: {
        workspaces: true,
        documentPasswordGrants: true,
      },
    });

    // Audit log for user creation (Zero Trust onboarding)
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "USER_CREATED",
        details: `Empleado creado: ${name} (${email}), Rol: ${role || "EMPLOYEE"}, Tipo: ${nextAccessRole}, Espacios: ${workspaceIds?.length || 0}, Visor: ${accessMode}`,
        status: "SUCCESS",
      }
    });

    const { password: createdPassword, twoFactorSecret: createdTwoFactorSecret, ...safeUser } = userWithGrants || newUser;
    void createdPassword;
    void createdTwoFactorSecret;
    return NextResponse.json(safeUser, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
