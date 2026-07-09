import { NextRequest, NextResponse } from "next/server";

/**
 * Basic Auth sederhana untuk MVP (aktifkan via BASIC_AUTH_ENABLED=true).
 * Struktur ini mudah diganti NextAuth pada fase berikutnya.
 */
export function middleware(req: NextRequest) {
  if (process.env.BASIC_AUTH_ENABLED !== "true") return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    if (user === process.env.BASIC_AUTH_USER && pass === process.env.BASIC_AUTH_PASSWORD) {
      return NextResponse.next();
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Brand Pulse OS"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
