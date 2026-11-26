"use server";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveGateway, testGateway } from "@/server/payments/gateway-admin";
import { stepUpForMoney } from "@/server/payouts/stepup";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const on = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

export async function saveGatewayAction(fd: FormData) {
  await requireSuperadmin();
  const provider = str(fd, "provider") === "mamo" ? "mamo" : "stripe";
  const go = (msg: string, err?: boolean): never => redirect(`/superadmin/gateways?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);
  await stepUpForMoney("gateway_keys", "/superadmin/gateways");
  const r = await saveGateway(provider, {
    secretKey: str(fd, "secretKey"), webhookSecret: str(fd, "webhookSecret"), publishableKey: str(fd, "publishableKey"),
    sandbox: on(fd, "sandbox"), enabled: on(fd, "enabled"), recipientPaysFees: on(fd, "recipientPaysFees"), payoutHoldDays: Number(str(fd, "payoutHoldDays") || 0),
  });
  if (!r.ok) return go(r.error, true);
  await audit("gateway.update", { provider, changed: r.changed });
  return go(`${provider === "stripe" ? "Stripe" : "Mamo Pay"} saved${r.changed.length ? ` (${r.changed.join(", ")})` : ""}.`);
}

export async function testGatewayAction(provider: "stripe" | "mamo", typedKey: string, sandbox: boolean) {
  await requireSuperadmin();
  const r = await testGateway(provider, typedKey, sandbox);
  await audit("gateway.test", { provider, ok: r.ok, typed: !!typedKey.trim() });
  return r;
}
