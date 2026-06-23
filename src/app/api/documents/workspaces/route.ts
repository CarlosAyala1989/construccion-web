import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { canUseWebDocuments, getAccessibleWorkspaces, getActiveRequestUser } from "@/lib/document-access";
import { getWorkspaceProvider } from "@/lib/document-storage";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = await getActiveRequestUser(session.user.id);
  if (!user?.isActive || !canUseWebDocuments(user)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const workspaces = await getAccessibleWorkspaces(user);

  return NextResponse.json(
    workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      cloudPath: workspace.cloudPath,
      cloudFolderId: workspace.cloudFolderId,
      provider: getWorkspaceProvider(workspace),
    }))
  );
}
