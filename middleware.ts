import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    const setupUrl = publicUrl(request, "/login");
    setupUrl.searchParams.set("config", "missing");
    return NextResponse.redirect(setupUrl);
  }

  const expected = await digest(password);
  const session = request.cookies.get("observer_session")?.value;
  if (session === expected) return NextResponse.next();

  const loginUrl = publicUrl(request, "/login");
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/health|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
