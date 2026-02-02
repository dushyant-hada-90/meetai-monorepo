import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { auth } from "@/lib/auth"

const PUBLIC_FILE = /\.(.*)$/
const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up"]
const AUTH_ROUTES = ["/sign-in", "/sign-up"]
const DEFAULT_REDIRECT = "/meetings"

const isRouteMatch = (pathname: string, routes: string[]) =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))

const safeRedirect = (value?: string | null) => {
  if (!value) return null
  if (!value.startsWith("/")) return null
  if (value.startsWith("//")) return null
  return value
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || PUBLIC_FILE.test(pathname)) {
    return NextResponse.next()
  }

  const isPublicRoute = isRouteMatch(pathname, PUBLIC_ROUTES)
  const isAuthRoute = isRouteMatch(pathname, AUTH_ROUTES)

  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null)
  const isAuthenticated = Boolean(session)

  const redirectToParam = req.nextUrl.searchParams.get("redirectTo")
  const resolvedRedirect = safeRedirect(redirectToParam) || DEFAULT_REDIRECT

  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL(resolvedRedirect, req.url))
  }

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL("/sign-in", req.url)
    loginUrl.searchParams.set("redirectTo", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}