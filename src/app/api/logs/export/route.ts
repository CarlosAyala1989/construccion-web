import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/logs/export — Exporta las bitácoras de auditoría a CSV.
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

  const where: any = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;
  if (workspaceId) where.workspaceId = workspaceId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      workspace: {
        select: { name: true }
      }
    }
  });

  // Construye el CSV.
  const headers = ["ID", "Fecha", "Usuario", "Acción", "Detalles", "Estado", "Espacio de Trabajo"];
  const rows = logs.map(log => [
    log.id,
    log.createdAt.toISOString(),
    log.userName || log.userId || "Sistema",
    log.action,
    `"${(log.details || "").replace(/"/g, '""')}"`,
    log.status,
    log.workspace?.name || "N/A",
  ]);

  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
