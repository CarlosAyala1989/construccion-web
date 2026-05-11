import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/sync/logs — Desktop client sends batch audit logs
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token de autorización requerido" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { logs } = data; // Array of log entries

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: "Se requiere un array de logs" }, { status: 400 });
    }

    // Batch insert audit logs (Unit of Work pattern — all or nothing)
    const created = await prisma.$transaction(
      logs.map((log: any) =>
        prisma.auditLog.create({
          data: {
            userId: log.userId,
            userName: log.userName,
            action: log.action,
            details: typeof log.details === "string" ? log.details : JSON.stringify(log.details),
            status: log.status || "SUCCESS",
            workspaceId: log.workspaceId,
          }
        })
      )
    );

    return NextResponse.json(
      { success: true, count: created.length },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Error al sincronizar logs" }, { status: 500 });
  }
}
