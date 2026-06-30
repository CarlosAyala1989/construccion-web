import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canUseWebDocuments, getActiveRequestUser, getAuthorizedWorkspace } from "@/lib/document-access";
import { getWorkspaceProvider, listLocalFolder } from "@/lib/document-storage";
import { DRIVE_FOLDER_MIME_TYPE, getDriveAccessToken, getDriveFileMetadata, getGoogleDriveErrorStatus, isDriveItemWithinFolder, listDriveFolder } from "@/lib/google-drive";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getActiveRequestUser(session.user.id);
  if (!user?.isActive || !canUseWebDocuments(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const requestedFolderId = request.nextUrl.searchParams.get("folderId") || "";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requerido" }, { status: 400 });
  }

  const workspace = await getAuthorizedWorkspace(user, workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "No tienes acceso a este espacio" }, { status: 403 });
  }

  try {
    const provider = getWorkspaceProvider(workspace);

    if (provider === "GOOGLE_DRIVE") {
      const accessToken = await getDriveAccessToken(workspace.cloudRefreshToken || "");
      const rootFolderId = workspace.cloudFolderId || "";
      const folderId = requestedFolderId || rootFolderId;
      const allowed = await isDriveItemWithinFolder(folderId, rootFolderId, accessToken);
      if (!allowed) {
        return NextResponse.json({ error: "Carpeta fuera del espacio autorizado" }, { status: 403 });
      }

      const folderMetadata = folderId === rootFolderId
        ? null
        : await getDriveFileMetadata(folderId, accessToken);
      if (folderMetadata && folderMetadata.mimeType !== DRIVE_FOLDER_MIME_TYPE) {
        return NextResponse.json({ error: "La ruta solicitada no es una carpeta" }, { status: 400 });
      }

      const items = await listDriveFolder(folderId, accessToken);
      const folders = items.filter(item => item.mimeType === DRIVE_FOLDER_MIME_TYPE);
      const files = items.filter(item => item.mimeType === "application/pdf");

      return NextResponse.json({
        workspace: { id: workspace.id, name: workspace.name, provider },
        currentFolder: {
          id: requestedFolderId,
          name: folderMetadata?.name || workspace.name,
          isRoot: folderId === rootFolderId,
        },
        folders: folders.map(folder => ({ ...folder, provider })),
        files: files.map(file => ({ ...file, provider })),
      });
    }

    if (provider === "LOCAL") {
      const listing = await listLocalFolder(workspace, requestedFolderId);
      return NextResponse.json({
        workspace: { id: workspace.id, name: workspace.name, provider },
        ...listing,
      });
    }

    return NextResponse.json(
      { error: "Este espacio no tiene un repositorio web compatible configurado." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al listar documentos" },
      { status: getGoogleDriveErrorStatus(error) }
    );
  }
}
