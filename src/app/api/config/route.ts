import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/config — Obtiene la configuración actual del sistema.
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Obtiene la configuración existente o crea una predeterminada.
  let config = await prisma.config.findFirst();

  if (!config) {
    config = await prisma.config.create({
      data: {
        compressionEnabled: false,
        compressionThresholdMb: 10,
        deleteLocalAfterUpload: false,
        cloudProvider: "MANUAL",
      }
    });
  }

  return NextResponse.json(config);
}

// PATCH /api/config — Actualiza la configuración del sistema.
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const {
      compressionEnabled,
      compressionThresholdMb,
      deleteLocalAfterUpload,
      cloudProvider,
      cloudCredentials,
    } = data;

    let config = await prisma.config.findFirst();

    if (!config) {
      config = await prisma.config.create({
        data: {
          compressionEnabled: compressionEnabled ?? false,
          compressionThresholdMb: compressionThresholdMb ?? 10,
          deleteLocalAfterUpload: deleteLocalAfterUpload ?? false,
          cloudProvider: cloudProvider ?? "MANUAL",
          cloudCredentials,
        }
      });
    } else {
      config = await prisma.config.update({
        where: { id: config.id },
        data: {
          ...(compressionEnabled !== undefined && { compressionEnabled }),
          ...(compressionThresholdMb !== undefined && { compressionThresholdMb }),
          ...(deleteLocalAfterUpload !== undefined && { deleteLocalAfterUpload }),
          ...(cloudProvider !== undefined && { cloudProvider }),
          ...(cloudCredentials !== undefined && { cloudCredentials }),
        }
      });
    }

    // Registra el cambio de configuración en la bitácora.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "CONFIG_UPDATED",
        details: JSON.stringify({
          compressionEnabled: config.compressionEnabled,
          compressionThresholdMb: config.compressionThresholdMb,
          deleteLocalAfterUpload: config.deleteLocalAfterUpload,
          cloudProvider: config.cloudProvider,
        }),
        status: "SUCCESS",
      }
    });

    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}
