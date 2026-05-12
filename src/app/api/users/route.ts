import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    include: {
      workspaces: true
    },
    orderBy: { createdAt: "desc" }
  });
  
  // Return users without passwords
  const safeUsers = users.map(user => {
    const { password, ...safeUser } = user;
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
    const { name, email, password, role, workspaceIds } = data;

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
        workspaces: {
          connect: workspaceIds?.map((id: string) => ({ id })) || []
        }
      },
      include: {
        workspaces: true
      }
    });

    // Audit log for user creation (Zero Trust onboarding)
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "USER_CREATED",
        details: `Empleado creado: ${name} (${email}), Rol: ${role || "EMPLOYEE"}, Espacios: ${workspaceIds?.length || 0}`,
        status: "SUCCESS",
      }
    });

    const { password: _, ...safeUser } = newUser;
    return NextResponse.json(safeUser, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}
