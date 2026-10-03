import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/logs — Visor forense de bitácoras de auditoría con filtros.
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status");
  const workspaceId = searchParams.get("workspaceId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Construye la cláusula where de forma dinámica.
  const where: any = {};

  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (workspaceId) where.workspaceId = workspaceId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        workspace: {
          select: { name: true }
        }
      }
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    }
  });
}

// POST /api/logs — Crea una entrada de auditoría (usada por la sincronización de escritorio).
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { userId, userName, action, details, status, workspaceId } = data;

    const log = await prisma.auditLog.create({
      data: {
        userId,
        userName,
        action,
        details,
        status: status || "SUCCESS",
        workspaceId,
      }
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear registro de auditoría" }, { status: 500 });
  }
}
