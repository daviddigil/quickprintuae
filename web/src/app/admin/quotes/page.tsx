import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { Download, MessageCircle, Phone, Mail } from "lucide-react";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { QUOTE_STATUSES, describeSelections, listQuotes, quoteCounts, quoteFiles, whatsappReplyUrl, type QuoteStatus } from "@/server/quotes";
import type { ProductConfig } from "@/lib/types";
import { changeQuoteStatus } from "./actions";

export const metadata = { title: "Quotes" };
const TONE = { new: "blue", replied: "yellow", won: "green", lost: "gray" } as const;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const { tenant } = await requireStaff();
  const sp = await searchParams;
  const filter = (QUOTE_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as QuoteStatus) : undefined;
  const [quotes, counts] = await Promise.all([listQuotes(tenant.id, filter), quoteCounts(tenant.id)]);
  const productIds = [...new Set(quotes.map((q) => q.productId).filter((x): x is string => !!x))];
  const products = productIds.length ? await db.select({ id: schema.products.id, config: schema.products.config }).from(schema.products).where(and(eq(schema.products.tenantId, tenant.id), inArray(schema.products.id, productIds))) : [];
  const cfg = new Map(products.map((p) => [p.id, p.config as ProductConfig]));
  const files = await quoteFiles(tenant.id, quotes.flatMap((q) => q.fileIds));
  const fileMap = new Map(files.map((f) => [f.id, f]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs: { key: string; label: string; n: number }[] = [{ key: "all", label: "All", n: total }, ...QUOTE_STATUSES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), n: counts[s] }))];
  const active = filter ?? "all";

  return (
    <div className="space-y-6">
      <PageHeader title="Quote requests" subtitle="Special orders, custom gift packing and bulk enquiries sent from your storefront. Reply to the customer on WhatsApp or by phone." />
      <Flash sp={sp} />
      <nav aria-label="Filter quotes" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={t.key === "all" ? "/admin/quotes" : `/admin/quotes?status=${t.key}`} aria-current={active === t.key ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${active === t.key ? "border-transparent bg-primary-container text-on-primary-container" : "border-outline-variant text-on-surface-variant hover:bg-surface-container"}`}>
            {t.label} <span className="rounded-full bg-surface-container px-2 text-xs">{t.n}</span>
          </Link>
        ))}
      </nav>
      {quotes.length === 0 ? (
        <EmptyState title={filter ? `No ${filter} quotes` : "No quote requests yet"}>Enable &ldquo;Request a quote&rdquo; on a product and requests will show up here.</EmptyState>
      ) : (
        <ul className="space-y-4" data-testid="quote-list">
          {quotes.map((q) => {
            const sel = describeSelections(q.productId ? cfg.get(q.productId) : null, q.selections);
            return (
              <li key={q.id}>
                <Card className="space-y-3 p-5" data-testid="quote-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{q.name}</h2>
                      <p className="text-sm text-on-surface-variant">{q.productName ?? "General enquiry"}{q.quantity ? ` · qty ${q.quantity}` : ""} · {q.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</p>
                    </div>
                    <Badge tone={TONE[q.status as QuoteStatus] ?? "gray"}>{q.status}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{q.message}</p>
                  {sel.length > 0 && (
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {sel.map((s) => <div key={s.label} className="flex gap-2"><dt className="text-on-surface-variant">{s.label}:</dt><dd className="font-medium">{s.value}</dd></div>)}
                    </dl>
                  )}
                  {q.fileIds.length > 0 && (
                    <ul className="flex flex-wrap gap-2 text-sm">
                      {q.fileIds.map((id) => { const f = fileMap.get(id); return f && !f.deletedAt ? (
                        <li key={id}><a href={`/api/v1/admin/files/${id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant px-3 hover:bg-surface-container"><Download size={15} />{f.filename}</a></li>
                      ) : null; })}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant pt-3">
                    <a href={whatsappReplyUrl(q.phone, tenant.name, q.name, q.productName)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-shape-md bg-primary px-4 text-sm font-semibold text-on-primary"><MessageCircle size={16} />Reply on WhatsApp</a>
                    <a href={`tel:${q.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-shape-md border border-outline-variant px-4 text-sm font-semibold"><Phone size={16} />Call {q.phone}</a>
                    {q.email && <a href={`mailto:${q.email}`} className="inline-flex min-h-11 items-center gap-2 rounded-shape-md border border-outline-variant px-4 text-sm font-semibold"><Mail size={16} />{q.email}</a>}
                    <form action={changeQuoteStatus} className="ms-auto flex flex-wrap gap-2">
                      <input type="hidden" name="quoteId" value={q.id} />
                      <input type="hidden" name="filter" value={active} />
                      {QUOTE_STATUSES.filter((s) => s !== q.status).map((s) => (
                        <Button key={s} type="submit" name="status" value={s} variant="secondary" size="sm" className="min-h-11 capitalize">Mark {s}</Button>
                      ))}
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
