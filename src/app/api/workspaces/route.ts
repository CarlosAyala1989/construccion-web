import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getDriveAccessToken, getGoogleDriveErrorStatus } from "@/lib/google-drive";

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const workspaces = await prisma.workspace.findMany({
    orderBy: { name: "asc" }
  });

  return NextResponse.json(workspaces);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const data = await request.json();
    const { name, cloudPath, defaultPassword, cloudFolderId, cloudRefreshToken } = data;
    const isGoogleDrive = String(cloudPath || "").startsWith("Google Drive:") || String(cloudPath || "").startsWith("Drive:");

    if (isGoogleDrive) {
      if (!cloudFolderId || !cloudRefreshToken) {
        return NextResponse.json(
          { error: "Carpeta y refresh token de Google Drive requeridos" },
          { status: 400 }
        );
      }

      await getDriveAccessToken(cloudRefreshToken);
    }

    const newWorkspace = await prisma.workspace.create({
      data: {
        name,
        cloudPath,
        defaultPassword,
        cloudFolderId: cloudFolderId || null,
        cloudRefreshToken: cloudRefreshToken || null,
      }
    });

    // Audit log for workspace creation
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "WORKSPACE_CREATED",
        details: `Espacio de trabajo creado: ${name} (Ruta: ${cloudPath})`,
        status: "SUCCESS",
      }
    });

    return NextResponse.json(newWorkspace, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al crear espacio de trabajo" },
      { status: getGoogleDriveErrorStatus(error) }
    );
  }
}
