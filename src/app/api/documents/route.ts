import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canUseWebDocuments, getActiveRequestUser, getAuthorizedWorkspace } from "@/lib/document-access";
import { getWorkspaceProvider, listLocalPdfs } from "@/lib/document-storage";
import { getDriveAccessToken, listDrivePdfs } from "@/lib/google-drive";

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
      const files = await listDrivePdfs(workspace.cloudFolderId || "", accessToken);

      return NextResponse.json({
        workspace: { id: workspace.id, name: workspace.name, provider },
        files: files.map(file => ({ ...file, provider })),
      });
    }

    if (provider === "LOCAL") {
      return NextResponse.json({
        workspace: { id: workspace.id, name: workspace.name, provider },
        files: await listLocalPdfs(workspace),
      });
    }

    return NextResponse.json(
      { error: "Este espacio no tiene un repositorio web compatible configurado." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al listar documentos" },
      { status: 500 }
    );
  }
}
