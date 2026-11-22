import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import * as payments from "@/server/payments";

type Tester = (provider: "stripe" | "mamo", keys: { secretKey?: string; apiKey?: string; sandbox?: boolean }) => Promise<{ ok: boolean; message: string }>;

/** Tests the typed key, or the saved key if none was typed. */
export async function POST(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || cu.user.role !== "owner") return NextResponse.json({ ok: false, message: "Only the owner can test payment keys" }, { status: 403 });
  const parsed = z.object({ provider: z.enum(["stripe", "mamo"]), key: z.string().optional(), sandbox: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 });
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid) });
  const p = tenant?.settings.payments ?? {};
  const { provider, sandbox } = parsed.data;
  let key = parsed.data.key?.trim();
  try { if (!key) key = decrypt(provider === "stripe" ? p.stripe?.secretKeyEnc : p.mamo?.apiKeyEnc); } catch { /* ignore */ }
  if (!key) return NextResponse.json({ ok: false, message: "Enter or save a key first" });
  const test = (payments as unknown as { testPaymentCredentials?: Tester }).testPaymentCredentials;
  if (!test) return NextResponse.json({ ok: false, message: "Connection test is not available yet" });
  try {
    const r = await test(provider, provider === "stripe" ? { secretKey: key } : { apiKey: key, sandbox: sandbox ?? p.mamo?.sandbox ?? true });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message });
  }
}
