import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/sync/upload — Desktop reports a successful document upload
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

    // Create audit log for the upload
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
