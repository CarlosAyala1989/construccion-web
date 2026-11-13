/**
 * Utilidades compartidas de admin sesión para servicios de la aplicación documental.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

/** Obtiene admin sesión dentro de admin sesión. */
export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "ADMIN" ? session : null;
}

/** Gestiona admin response dentro de admin sesión. */
export function unauthorizedAdminResponse() {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
