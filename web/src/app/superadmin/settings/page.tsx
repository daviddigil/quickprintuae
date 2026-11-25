import { sql } from "drizzle-orm";
import { db } from "@/db";
import { Badge, Card, CardHeader } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";

export const dynamic = "force-dynamic";

const VARS: { name: string; purpose: string; required?: boolean }[] = [
  { name: "DATABASE_URL", purpose: "PostgreSQL connection", required: true },
  { name: "APP_URL", purpose: "Public base URL (payment return links)", required: true },
  { name: "ROOT_DOMAIN", purpose: "Wildcard domain for shop subdomains", required: true },
  { name: "AUTH_SECRET", purpose: "Session signing key", required: true },
  { name: "ENCRYPTION_KEY", purpose: "Encrypts tenant API keys & confidential files", required: true },
  { name: "UPLOAD_DIR", purpose: "Persistent upload volume" },
  { name: "ANTHROPIC_API_KEY", purpose: "AI business card designer" },
  { name: "PLATFORM_STRIPE_SECRET_KEY", purpose: "Charges print shops for subscriptions" },
  { name: "PLATFORM_STRIPE_WEBHOOK_SECRET", purpose: "Verifies platform Stripe webhooks" },
  { name: "CRON_SECRET", purpose: "Protects cron endpoints", required: true },
  { name: "DELIVERY_FAKE", purpose: "Simulate courier APIs (dev/staging only)" },
  { name: "META_APP_ID", purpose: "WhatsApp: Meta app for 'Connect with Facebook' (Embedded Signup)" },
  { name: "META_APP_SECRET", purpose: "WhatsApp: verifies Meta webhooks + exchanges signup codes" },
  { name: "META_VERIFY_TOKEN", purpose: "WhatsApp: webhook verification token you paste into Meta" },
  { name: "META_EMBEDDED_SIGNUP_CONFIG_ID", purpose: "WhatsApp: Embedded Signup (coexistence) configuration id" },
];

export default async function PlatformSettings() {
  let dbOk = false, dbVersion = "";
  try {
    const r = await db.execute(sql`select version() as v`);
    dbOk = true; dbVersion = String((r as unknown as { v: string }[])[0]?.v ?? "").split(" ").slice(0, 2).join(" ");
  } catch { /* down */ }
  const prod = process.env.NODE_ENV === "production";
  return (
    <>
      <PageTitle title="Platform health" subtitle="Values are never displayed — only whether they are configured." />
      <Card className="mb-6">
        <CardHeader title="Runtime" />
        <dl className="grid grid-cols-2 gap-y-2 px-5 py-4 text-sm sm:grid-cols-4">
          <dt className="text-slate-500">Database</dt><dd>{dbOk ? <Badge tone="green">connected</Badge> : <Badge tone="red">down</Badge>} <span className="text-xs text-slate-500">{dbVersion}</span></dd>
          <dt className="text-slate-500">Environment</dt><dd><Badge tone={prod ? "green" : "yellow"}>{process.env.NODE_ENV}</Badge></dd>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Environment variables" />
        <ul className="divide-y divide-slate-100 text-sm">
          {VARS.map((v) => {
            const set = !!process.env[v.name];
            return (
              <li key={v.name} className="flex items-center justify-between gap-4 px-5 py-3">
                <div><p className="font-mono text-xs font-semibold">{v.name}</p><p className="text-xs text-slate-500">{v.purpose}</p></div>
                {set ? <Badge tone="green">set</Badge> : <Badge tone={v.required ? "red" : "gray"}>{v.required ? "missing" : "not set"}</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
