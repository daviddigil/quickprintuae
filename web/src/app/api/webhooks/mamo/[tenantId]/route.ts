import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Retired: shops no longer hold gateway keys. All card payments go through the platform webhook at /api/webhooks/mamo. */
const gone = () => NextResponse.json({ error: "Gone", message: "Per-shop Mamo Pay webhooks were retired. Payments are collected by QuickPrint; use the platform webhook /api/webhooks/mamo." }, { status: 410 });
export const POST = gone;
export const GET = gone;
