import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { mask, decrypt } from "@/lib/crypto";
import { EMIRATES } from "@/lib/types";
import { DELIVERY_PROVIDERS } from "@/server/delivery";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { deletePickupLocation, saveDeliveryProvider, savePickupLocation, saveSlotSettings, saveZones } from "../actions";

export const metadata = { title: "Pickup & delivery" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const safeMask = (enc?: string) => { try { return mask(decrypt(enc)); } catch { return "••••"; } };

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  const locations = await db.query.pickupLocations.findMany({ where: eq(schema.pickupLocations.tenantId, tenant.id), orderBy: [asc(schema.pickupLocations.name)] });
  const zones = await db.query.deliveryZones.findMany({ where: eq(schema.deliveryZones.tenantId, tenant.id) });
  zones.sort((a, b) => EMIRATES.indexOf(a.emirate as never) - EMIRATES.indexOf(b.emirate as never));
  const d = tenant.settings.delivery;
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader title="Pickup & delivery" subtitle="Branches for collection, delivery fees per emirate, time slots and courier partners." />
      <Flash sp={sp} />

      <Card>
        <CardHeader title="Scheduling" subtitle="Customers choose a pickup or delivery slot at checkout." />
        <form action={saveSlotSettings} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pickupEnabled" defaultChecked={d.pickupEnabled} /> Offer store pickup</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={d.enabled} /> Offer delivery</label>
          <Field label="Slot length">
            <Select name="slotMinutes" defaultValue={String(d.slotMinutes)}>{[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}</Select>
          </Field>
          <Field label="Book up to (days ahead)"><Input type="number" name="scheduleDaysAhead" min={0} max={60} defaultValue={d.scheduleDaysAhead} /></Field>
          <Field label="Opens (hour, 0–23)"><Input type="number" name="openHour" min={0} max={23} defaultValue={d.openHour} /></Field>
          <Field label="Closes (hour, 1–24)"><Input type="number" name="closeHour" min={1} max={24} defaultValue={d.closeHour} /></Field>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-medium text-slate-700">Closed on</p>
            <div className="flex flex-wrap gap-3 text-sm">{DAYS.map((n, i) => <label key={i} className="flex items-center gap-1"><input type="checkbox" name={`closed_${i}`} defaultChecked={d.closedWeekdays.includes(i)} />{n}</label>)}</div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4"><Button>Save scheduling</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Pickup locations" />
        <div className="divide-y">
          {[...locations, null].map((l) => (
            <form key={l?.id ?? "new"} action={savePickupLocation} className="grid items-end gap-3 p-5 md:grid-cols-6">
              <input type="hidden" name="id" value={l?.id ?? ""} />
              <Field label={l ? "Branch name" : "New branch"}><Input name="name" defaultValue={l?.name} required /></Field>
              <div className="md:col-span-2"><Field label="Address"><Input name="address" defaultValue={l?.address} required /></Field></div>
              <Field label="Emirate"><Select name="emirate" defaultValue={l?.emirate ?? tenant.emirate}>{EMIRATES.map((e) => <option key={e}>{e}</option>)}</Select></Field>
              <Field label="Hours"><Input name="hours" defaultValue={l?.hours ?? "Sat–Thu 9:00–21:00"} /></Field>
              <Field label="Google Maps link"><Input name="mapUrl" defaultValue={l?.mapUrl ?? ""} /></Field>
              <div className="flex items-center gap-3 md:col-span-6">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l?.active ?? true} /> Active</label>
                <Button variant={l ? "secondary" : "primary"}>{l ? "Save" : "Add location"}</Button>
                {l && <Button formAction={deletePickupLocation} variant="ghost" className="text-red-600">Remove</Button>}
              </div>
            </form>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Delivery zones" subtitle="Fee per emirate (AED, excl. VAT). Leave 'Free above' empty to always charge." />
        <form action={saveZones}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Emirate</th><th className="px-4 py-2">Fee</th><th className="px-4 py-2">Free above</th><th className="px-4 py-2">Min. lead time (h)</th><th className="px-4 py-2">Same day</th><th className="px-4 py-2">Active</th></tr></thead>
              <tbody className="divide-y">
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td className="px-4 py-2 font-medium">{z.emirate}</td>
                    <td className="px-4 py-2"><Input className="w-24" type="number" step="0.5" min={0} name={`fee_${z.id}`} defaultValue={z.fee} /></td>
                    <td className="px-4 py-2"><Input className="w-24" type="number" step="1" min={0} name={`free_${z.id}`} defaultValue={z.freeAbove ?? ""} /></td>
                    <td className="px-4 py-2"><Input className="w-24" type="number" min={0} name={`lead_${z.id}`} defaultValue={z.minLeadHours} /></td>
                    <td className="px-4 py-2"><input type="checkbox" name={`same_${z.id}`} defaultChecked={z.sameDay} /></td>
                    <td className="px-4 py-2"><input type="checkbox" name={`active_${z.id}`} defaultChecked={z.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-5"><Button>Save zones</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Courier partners" subtitle={isOwner ? "Connect an aggregator to book deliveries from the order page. API keys are encrypted." : "Only the owner can change courier settings."} />
        <div className="divide-y">
          {DELIVERY_PROVIDERS.map((p) => {
            const cur = d.providers?.[p.code];
            return (
              <form key={p.code} action={saveDeliveryProvider} className="grid items-end gap-3 p-5 md:grid-cols-6">
                <input type="hidden" name="code" value={p.code} />
                <div className="md:col-span-1">
                  <p className="font-semibold">{p.name}</p>
                  <div className="mt-1 flex gap-1">
                    {cur?.enabled ? <Badge tone="green">Enabled</Badge> : <Badge>Off</Badge>}
                    {d.defaultProvider === p.code && <Badge tone="blue">Default</Badge>}
                  </div>
                </div>
                {p.needsApiKey ? (
                  <>
                    <div className="md:col-span-2"><Field label="API key" hint={cur?.apiKeyEnc ? `saved: ${safeMask(cur.apiKeyEnc)}` : undefined}><Input name="apiKey" type="password" placeholder={cur?.apiKeyEnc ? "Leave empty to keep" : "Paste API key"} autoComplete="off" disabled={!isOwner} /></Field></div>
                    <Field label="Account / client ID"><Input name="accountId" defaultValue={cur?.accountId ?? ""} disabled={!isOwner} /></Field>
                  </>
                ) : <p className="text-sm text-slate-500 md:col-span-3">{p.code === "inhouse" ? "Your own drivers. Orders get an internal reference and a driver run sheet." : "Enter tracking details by hand on each order."}</p>}
                <div className="flex flex-wrap items-center gap-3 text-sm md:col-span-2">
                  <label className="flex items-center gap-1"><input type="checkbox" name="enabled" defaultChecked={cur?.enabled ?? false} disabled={!isOwner} />Enabled</label>
                  {p.needsApiKey && <label className="flex items-center gap-1"><input type="checkbox" name="sandbox" defaultChecked={cur?.sandbox ?? true} disabled={!isOwner} />Sandbox</label>}
                  <label className="flex items-center gap-1"><input type="checkbox" name="makeDefault" defaultChecked={d.defaultProvider === p.code} disabled={!isOwner} />Default</label>
                  <Button variant="secondary" disabled={!isOwner}>Save</Button>
                </div>
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
