import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  const where: any = {};
  if (workspaceId) where.workspaceId = workspaceId;

  const policies = await prisma.securityPolicy.findMany({
    where,
    orderBy: { priority: "desc" },
    include: {
      workspace: { select: { name: true } }
    }
  });

  return NextResponse.json(policies);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const { type, target, password, priority, workspaceId } = data;

    const newPolicy = await prisma.securityPolicy.create({
      data: {
        type, // "SEMANTIC" | "VISUAL"
        target,
        password,
        priority: priority || 0,
        workspaceId: workspaceId || null,
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "POLICY_CREATED",
        details: `Política ${type} creada: "${target}" con prioridad ${priority || 0}`,
        status: "SUCCESS",
        workspaceId: workspaceId || null,
      }
    });

    return NextResponse.json(newPolicy, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear política de seguridad" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Se requiere el ID de la política" }, { status: 400 });
    }

    const policy = await prisma.securityPolicy.delete({ where: { id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "POLICY_DELETED",
        details: `Política ${policy.type} eliminada: "${policy.target}"`,
        status: "SUCCESS",
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Error al eliminar política" }, { status: 500 });
  }
}

