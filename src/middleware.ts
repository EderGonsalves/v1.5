import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection middleware.
 *
 * For state-changing requests (POST, PUT, PATCH, DELETE) to API routes,
 * validates that the Origin header matches the request's host.
 *
 * This is defense-in-depth — SameSite=Lax on our auth cookie already
 * blocks most CSRF vectors in modern browsers.
 *
 * Excluded paths:
 * - /api/v1/auth/login (pre-auth, no cookie yet)
 * - /api/v1/calendar/availability (public endpoint)
 * - /api/health (public health check)
 * - /api/follow-up/check (called by external cron with bearer token)
 */

const CSRF_EXEMPT_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/calendar/availability",
  "/api/health",
  "/api/follow-up/check",
  "/api/v1/lawsuit/webhook",
]);

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Resolves the trusted host from request headers.
 * Checks X-Forwarded-Host first (set by reverse proxies like Traefik),
 * then falls back to the Host header.
 */
function resolveHost(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    null
  );
}

function isOriginAllowed(origin: string, host: string): boolean {
  try {
    const originHost = new URL(origin).host;
    // X-Forwarded-Host may contain multiple values (comma-separated);
    // the first one is the original client host.
    const primaryHost = host.split(",")[0].trim();
    return originHost === primaryHost;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only check API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Only check state-changing methods
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  // Skip exempt paths
  if (CSRF_EXEMPT_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const host = resolveHost(request);

  // If no Origin header, check Referer as fallback
  // (some older browsers or non-browser clients may not send Origin)
  if (!origin) {
    const referer = request.headers.get("referer");
    if (referer && host) {
      if (!isOriginAllowed(referer, host)) {
        return NextResponse.json(
          { error: "Requisição bloqueada (CSRF)" },
          { status: 403 },
        );
      }
    }
    // No Origin AND no Referer — allow (server-to-server calls, curl, etc.)
    return NextResponse.next();
  }

  // Validate Origin matches host
  if (!host || !isOriginAllowed(origin, host)) {
    return NextResponse.json(
      { error: "Requisição bloqueada (CSRF)" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
