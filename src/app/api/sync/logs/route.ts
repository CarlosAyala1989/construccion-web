// RF-17

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/sync/logs — El cliente de escritorio envía un lote de bitácoras de auditoría.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token de autorización requerido" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { logs } = data; // Arreglo de entradas de bitácora.

    if (!Array.isArray(logs) || logs.length === 0) {
      return NextResponse.json({ error: "Se requiere un array de logs" }, { status: 400 });
    }

    // Inserta el lote de bitácoras como una sola unidad de trabajo (todo o nada).
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
