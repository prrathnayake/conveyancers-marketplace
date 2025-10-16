import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const adminHost = (process.env.ADMIN_PORTAL_HOST ?? '').toLowerCase()

export function middleware(request: NextRequest) {
  if (!adminHost) {
    return NextResponse.next()
  }

  const hostHeader = request.headers.get('host') ?? ''
  const hostname = hostHeader.split(':')[0].toLowerCase()
  if (hostname !== adminHost) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  if (pathname.startsWith('/admin-portal')) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = `/admin-portal${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!api|_next|static|favicon.ico).*)'],
}
