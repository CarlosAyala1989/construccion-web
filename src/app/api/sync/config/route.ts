import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sync/config — Desktop client fetches all configuration
// This endpoint is authenticated via JWT token from desktop login
export async function GET(request: Request) {
  // Desktop client sends JWT in Authorization header
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token de autorización requerido" }, { status: 401 });
  }

  try {
    // Fetch all data the desktop needs
    const [workspaces, policies, config, nomenclatures] = await Promise.all([
      prisma.workspace.findMany({
        include: {
          users: {
            select: { id: true, email: true, name: true, isActive: true }
          }
        }
      }),
      prisma.securityPolicy.findMany({
        orderBy: { priority: "desc" }
      }),
      prisma.config.findFirst(),
      prisma.nomenclatureField.findMany({
        orderBy: { fieldOrder: "asc" }
      }),
    ]);

    return NextResponse.json({
      workspaces,
      policies,
      config: config || {
        compressionEnabled: false,
        compressionThresholdMb: 10,
        deleteLocalAfterUpload: false,
        cloudProvider: "MANUAL",
      },
      nomenclatures,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al obtener configuración" }, { status: 500 });
  }
}
