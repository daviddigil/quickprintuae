import { NextResponse } from "next/server";

/** Retired: shops no longer hold or test gateway keys (superadmin /superadmin/gateways does). */
const gone = () => NextResponse.json({ ok: false, message: "Gateway keys are managed by QuickPrint. Shops no longer enter payment keys." }, { status: 410 });
export const POST = gone;
export const GET = gone;
