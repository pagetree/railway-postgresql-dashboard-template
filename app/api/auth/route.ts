import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const supplied = String(form.get("password") || "");
  const expected = process.env.DASHBOARD_PASSWORD;
  const nextPath = String(form.get("next") || "/");
  const destination = nextPath.startsWith("/") ? nextPath : "/";

  if (!expected || !safeMatch(hash(supplied), hash(expected))) {
    const failure = publicUrl(request, "/login");
    failure.searchParams.set("error", "1");
    failure.searchParams.set("next", destination);
    return NextResponse.redirect(failure, 303);
  }

  const response = NextResponse.redirect(publicUrl(request, destination), 303);
  response.cookies.set("observer_session", hash(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("observer_session", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}
