import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  // 1. Allow unrestricted access to the landing page
  if (pathname === "/") {
    return NextResponse.next()
  }

  // 2. Check if the session token cookie exists
  // NOTE: Check your Application -> Cookies tab to confirm your specific cookie name.
  // Common names are "better-auth.session_token", "next-auth.session-token", or just "session_token"
  const hasToken = req.cookies.has("better-auth.session_token") || 
                   req.cookies.has("session_token")

  const isProtectedRoute =
    pathname.startsWith("/agents") ||
    pathname.startsWith("/meetings") ||
    pathname.startsWith("/call") ||
    pathname.startsWith("/upgrade")

  // 3. UX Gate: If trying to access a protected route without a token cookie -> Redirect
  if (isProtectedRoute && !hasToken) {
    const loginUrl = new URL("/sign-in", req.url)
    loginUrl.searchParams.set("redirectTo", pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}