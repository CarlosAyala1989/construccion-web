import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware to protect authenticated routes.
 * Only authenticated users with ADMIN role can access /dashboard/*.
 * Unauthenticated users are redirected to the login page.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isDocumentsRoute = request.nextUrl.pathname.startsWith("/documents");

  if (isDashboardRoute || isDocumentsRoute) {
    if (!token) {
      // Redirect to login
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Only ADMIN role can access the dashboard
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
