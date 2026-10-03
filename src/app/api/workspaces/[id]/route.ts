import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { ACCESS_ROLE_WEB_VIEWER, DOCUMENT_ACCESS_PASSWORD_SCOPED, defaultCredentialKey } from "@/lib/document-access";
import { getDriveAccessToken, getGoogleDriveErrorStatus } from "@/lib/google-drive";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const params = await props.params;
    const { id } = params;
    const data = await request.json();
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!existingWorkspace) {
      return NextResponse.json({ error: "Espacio de trabajo no encontrado" }, { status: 404 });
    }

    const { userIds } = data; // Arreglo de identificadores de usuario que se asignarán.

    if (!Array.isArray(userIds)) {
      const hasDriveUpdate = "cloudPath" in data || "cloudFolderId" in data || "cloudRefreshToken" in data;

      if (!hasDriveUpdate) {
        return NextResponse.json({ error: "Datos de actualización requeridos" }, { status: 400 });
      }

      const cloudPath = String(data.cloudPath || "").trim();
      const cloudFolderId = String(data.cloudFolderId || "").trim();
      const cloudRefreshToken = String(data.cloudRefreshToken || "").trim();

      if (!cloudPath.startsWith("Google Drive:") && !cloudPath.startsWith("Drive:")) {
        return NextResponse.json({ error: "Solo se puede reconectar un destino de Google Drive" }, { status: 400 });
      }

      if (!cloudFolderId || !cloudRefreshToken) {
        return NextResponse.json({ error: "Carpeta y refresh token de Google Drive requeridos" }, { status: 400 });
      }

      await getDriveAccessToken(cloudRefreshToken);

      const updatedWorkspace = await prisma.workspace.update({
        where: { id },
        data: {
          cloudPath,
          cloudFolderId,
          cloudRefreshToken,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          userName: session.user.name || "Admin",
          action: "WORKSPACE_DRIVE_RECONNECTED",
          details: `Google Drive reconectado para espacio ${updatedWorkspace.name}: ${cloudPath}`,
          status: "SUCCESS",
          workspaceId: id,
        }
      });

      return NextResponse.json(updatedWorkspace);
    }

    // En Prisma, para actualizar una relación muchos a muchos, usamos "set" 
    // para reemplazar la lista completa de usuarios asignados.
    const updatedWorkspace = await prisma.workspace.update({
      where: { id },
      data: {
        users: {
          set: userIds.map((userId: string) => ({ id: userId }))
        }
      },
      include: {
        users: true
      }
    });

    await prisma.documentPasswordGrant.deleteMany({
      where: {
        workspaceId: id,
        userId: { notIn: userIds },
      },
    });

    const scopedUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        accessRole: ACCESS_ROLE_WEB_VIEWER,
        documentAccessMode: DOCUMENT_ACCESS_PASSWORD_SCOPED,
      },
      include: {
        documentPasswordGrants: {
          where: { workspaceId: id },
        },
      },
    });

    await Promise.all(
      scopedUsers
        .filter(user => user.documentPasswordGrants.length === 0)
        .map(user =>
          prisma.documentPasswordGrant.create({
            data: {
              userId: user.id,
              workspaceId: id,
              credentialKey: defaultCredentialKey(id),
              sourceType: "DEFAULT",
              label: `Predeterminada de ${updatedWorkspace.name}`,
            },
          })
        )
    );

    // Registra el cambio de permisos en la bitácora de auditoría.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name || "Admin",
        action: "WORKSPACE_USERS_UPDATED",
        details: `Usuarios asignados a espacio ${updatedWorkspace.name}: ${userIds.length} usuario(s)`,
        status: "SUCCESS",
        workspaceId: id,
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al actualizar el espacio de trabajo" },
      { status: getGoogleDriveErrorStatus(error) }
    );
  }
}
