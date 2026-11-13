/**
 * Ruta API drive/oauth-config: procesa solicitudes, valida condiciones de acceso y responde al cliente.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getGoogleCredentials } from "@/lib/google-drive";

export const runtime = "nodejs";

/** Atiende GET de drive/oauth-config y devuelve la respuesta HTTP correspondiente. */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const credentials = await getGoogleCredentials();

  return NextResponse.json({
    clientId: credentials.clientId,
    isConfigured: Boolean(credentials.clientId && credentials.clientSecret),
  });
}
