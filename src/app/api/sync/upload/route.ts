import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/sync/upload — El escritorio informa que la carga de un documento fue exitosa.
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token de autorización requerido" }, { status: 401 });
  }

  try {
    const data = await request.json();
    const {
      userId,
      userName,
      workspaceId,
      fileName,
      originalName,
      cloudDestination,
      encryptionApplied,
      encryptionType,  // "SEMANTIC", "VISUAL", "DEFAULT"
      policyId,
      fileSizeMb,
      compressed,
    } = data;

    // Crea una bitácora de auditoría para la carga.
    const log = await prisma.auditLog.create({
      data: {
        userId,
        userName: userName || "Desktop Client",
        action: "DOCUMENT_UPLOADED",
        details: JSON.stringify({
          fileName,
          originalName,
          cloudDestination,
          encryptionApplied,
          encryptionType,
          policyId,
          fileSizeMb,
          compressed,
          uploadedAt: new Date().toISOString(),
        }),
        status: "SUCCESS",
        workspaceId,
      }
    });

    return NextResponse.json({ success: true, logId: log.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al registrar subida" }, { status: 500 });
  }
}
