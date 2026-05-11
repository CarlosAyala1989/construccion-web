import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware to protect dashboard routes.
 * Only authenticated users with ADMIN role can access /dashboard/*.
 * Unauthenticated users are redirected to the login page.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const isDashboardRoute = request.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboardRoute) {
    if (!token) {
      // Redirect to login
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Only ADMIN role can access the dashboard
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
