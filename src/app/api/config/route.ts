import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

// GET /api/config — Retrieve current system configuration
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Get existing config or create default
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

// PATCH /api/config — Update system configuration
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

    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}
