import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // 1. Allow unrestricted access to public assets and API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") // Catch-all for files (images, favicon, etc.)
  ) {
    return NextResponse.next()
  }

  // 2. Allow unrestricted access to the landing page
  if (pathname === "/") {
    return NextResponse.next()
  }

  // 3. Check if the session token cookie exists
  // better-auth typically uses "better-auth.session_token" or "session_token"
  const hasToken = 
    request.cookies.has("session_token") || 
    request.cookies.has("__Secure-session_token") ||
    request.cookies.has("better-auth.session_token") || 
    request.cookies.has("__Secure-better-auth.session_token");

  const isProtectedRoute =
    pathname.startsWith("/agents") ||
    pathname.startsWith("/meetings") ||
    pathname.startsWith("/call") ||
    pathname.startsWith("/upgrade")

  // 4. UX Gate: If trying to access a protected route without a token cookie -> Redirect
  // We do NOT perform full auth validation here (DB calls) to avoid Edge Runtime issues.
  if (isProtectedRoute && !hasToken) {
    const loginUrl = new URL("/sign-in", request.url)
    loginUrl.searchParams.set("redirectTo", pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  // 5. Optional: If user is on a public auth route (sign-in/sign-up) and HAS a token,
  // we do NOT redirect them here. We let the page/server-component handle that redirect.
  // This prevents infinite loops if the cookie exists but is invalid/expired.

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}