import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { publicOrigin } from "@/lib/origin";

export async function GET(req: Request) {
  await destroySession();
  const next = new URL(req.url).searchParams.get("next") ?? "/";
  return NextResponse.redirect(new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", publicOrigin(req)));
}
