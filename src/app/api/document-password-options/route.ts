import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getPasswordOptionsForWorkspaces } from "@/lib/document-access";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceIds = [
    ...searchParams.getAll("workspaceId"),
    ...(searchParams.get("workspaceIds") || "").split(","),
  ].filter(Boolean);

  const options = await getPasswordOptionsForWorkspaces(workspaceIds);
  return NextResponse.json(options);
}
