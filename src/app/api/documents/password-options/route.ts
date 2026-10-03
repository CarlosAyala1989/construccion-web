import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  DOCUMENT_ACCESS_GLOBAL,
  canUseWebDocuments,
  getActiveRequestUser,
  getAuthorizedWorkspace,
  getPasswordOptionsForWorkspaces,
} from "@/lib/document-access";
import { prisma } from "@/lib/prisma";

// RF-18
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

  const options = await getPasswordOptionsForWorkspaces([workspace.id]);

  if (user.role === "ADMIN" || user.documentAccessMode === DOCUMENT_ACCESS_GLOBAL) {
    return NextResponse.json(options);
  }

  const grants = await prisma.documentPasswordGrant.findMany({
    where: {
      userId: user.id,
      workspaceId: workspace.id,
    },
    select: { credentialKey: true },
  });
  const allowedKeys = new Set(grants.map(grant => grant.credentialKey));

  return NextResponse.json(options.filter(option => allowedKeys.has(option.credentialKey)));
}
