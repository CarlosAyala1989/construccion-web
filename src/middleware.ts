import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware para proteger las rutas autenticadas.
 * Solo los usuarios autenticados con rol ADMIN pueden acceder a /dashboard/*.
 * Los usuarios sin autenticar son redirigidos a la página de inicio de sesión.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isDocumentsRoute = request.nextUrl.pathname.startsWith("/documents");

  if (isDashboardRoute || isDocumentsRoute) {
    if (!token) {
      // Redirige al inicio de sesión.
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Solo el rol ADMIN puede acceder al panel.
    if (isDashboardRoute && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/documents", request.url));
    }

    if (isDocumentsRoute && token.role !== "ADMIN" && token.accessRole !== "WEB_VIEWER") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/documents/:path*"],
};
