import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/sync/config — El cliente de escritorio obtiene toda la configuración.
// Este endpoint se autentica con el token JWT del inicio de sesión de escritorio.
export async function GET(request: Request) {
  // El cliente de escritorio envía el JWT en el encabezado Authorization.
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Token de autorización requerido" }, { status: 401 });
  }

  try {
    // Obtiene todos los datos que necesita el cliente de escritorio.
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
