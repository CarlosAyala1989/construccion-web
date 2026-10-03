import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getGoogleCredentials, readGoogleError } from "@/lib/google-drive";

export const runtime = "nodejs";

// POST /api/drive/token — Intercambia un código de autorización por un token de renovación.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    if (request.headers.get("x-requested-with")?.toLowerCase() !== "xmlhttprequest") {
      return NextResponse.json({ error: "Solicitud OAuth inválida" }, { status: 400 });
    }

    const body = await request.json();
    const { code, redirectUri } = body;
    const credentials = await getGoogleCredentials();
    const requestOrigin = request.headers.get("origin") || new URL(request.url).origin;
    const tokenRedirectUri = typeof redirectUri === "string" && redirectUri.trim()
      ? redirectUri.trim()
      : requestOrigin;

    if (!code) {
      return NextResponse.json({ error: "Código de autorización requerido" }, { status: 400 });
    }

    if (tokenRedirectUri !== requestOrigin) {
      return NextResponse.json({ error: "Origen OAuth inválido" }, { status: 400 });
    }

    if (!credentials.clientId || !credentials.clientSecret) {
      return NextResponse.json(
        { error: "Credenciales OAuth de Google Drive no configuradas en el servidor" },
        { status: 500 }
      );
    }

    // Intercambia el código de autorización por tokens (incluido el token de renovación).
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: tokenRedirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await readGoogleError(tokenRes);
      return NextResponse.json(
        { error: err.error_description || err.message || "Error al obtener tokens" },
        { status: tokenRes.status }
      );
    }

    const tokens = await tokenRes.json();

    return NextResponse.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_in: tokens.expires_in,
    });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
