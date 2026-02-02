import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 1️⃣ Define Public Routes (Whitelist)
  // These are the ONLY routes accessible without a session
  const publicRoutes = [
    "/sign-in",
    "/sign-up",
  ];

  // Check if the current path matches a public route
  const isPublicRoute = publicRoutes.some((route) => 
    pathname === route || pathname.startsWith(`${route}/`)
  );

  // 2️⃣ Allow Public Routes & Static Assets immediately
  // Note: The matcher config handles most static assets, but this is a safety net
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // 3️⃣ Security Check (Protected by Default)
  // If we are here, the route is NOT public, so it MUST be protected.
  const hasSessionCookie =
    req.cookies.get("better-auth.session_token") || // 👈 FIXED: Added "_token"
    req.cookies.get("__Secure-better-auth.session_token") || // Handle Production (HTTPS)
    req.cookies.get("session"); // Keep legacy if needed

  if (!hasSessionCookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/sign-in";
    loginUrl.searchParams.set("redirectTo", pathname + search);

    return NextResponse.redirect(loginUrl);
  }

  // 4️⃣ Allow request continue
  return NextResponse.next();
}

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api/auth (if you want middleware to ignore auth API completely)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico, sitemap.xml, robots.txt (common static files)
   * - images, fonts (path conventions)
   */
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg).*)",
  ],
};