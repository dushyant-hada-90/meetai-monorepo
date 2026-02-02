import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/lib/auth"

export async function middleware(req: NextRequest) {
  
  const session = await auth.api.getSession({
    headers: req.headers,
  })
  
  const { pathname, search } = req.nextUrl
  
  const isProtectedRoute =
  pathname === "/" ||
  pathname.startsWith("/agents") ||
  pathname.startsWith("/meetings") ||
  pathname.startsWith("/call") ||
  pathname.startsWith("/upgrade")
  console.log("MIDDLEWARE HIT:",pathname,isProtectedRoute)

  if (!session && isProtectedRoute) {
    console.log("routing to login")
    const loginUrl = new URL("/sign-in", req.url)
    loginUrl.searchParams.set("redirectTo", pathname + search)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
