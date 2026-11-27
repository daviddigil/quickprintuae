import { requireStaff } from "@/lib/auth";
import { hasFeature } from "@/server/billing";
import { PoweredBy } from "@/components/PoweredBy";
import { LogoImage } from "@/components/platform/Logo";
import { PrintButton } from "@/components/admin/PrintButton";
import { LinkButton } from "@/components/ui";
import { redirect } from "next/navigation";
import { walkInQrSvg, walkInUrl } from "../data";

export const metadata = { title: "Walk-in QR poster" };

export default async function PosterPage() {
  const { tenant } = await requireStaff();
  if (!(await hasFeature(tenant, "walk_in_queue"))) redirect("/admin/walk-in");
  const url = walkInUrl(tenant);
  const qr = await walkInQrSvg(url, 460);
  const steps = [["1", "Scan", "Point your phone camera at the code"], ["2", "Upload", "Choose the documents you want printed"], ["3", "Pay", "Pay securely on your phone — no cash at the counter"], ["4", "Collect", "We print in order — pick up when it’s ready"]];
  return (
    <div>
      <style>{"@page { size: A4; margin: 0 } @media print { body { background: #fff !important } }"}</style>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden"><LinkButton variant="secondary" href="/admin/walk-in">← Back</LinkButton><PrintButton /></div>
      <div data-testid="poster" className="mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col items-center bg-white px-[14mm] py-[16mm] text-center shadow-sm print:min-h-0 print:h-[290mm] print:overflow-hidden print:max-w-none print:shadow-none" style={{ ["--store" as string]: tenant.primaryColor }}>
        <p className="text-2xl font-bold tracking-tight text-on-surface-variant">{tenant.name}</p>
        <h1 className="mt-6 text-6xl font-extrabold leading-tight tracking-tight" style={{ color: tenant.primaryColor }}>Scan to print</h1>
        <p className="mt-3 text-2xl text-on-surface-variant">Upload · Pay · Collect</p>
        <div className="mt-10 rounded-3xl border-[6px] bg-white p-5" style={{ borderColor: tenant.primaryColor }} dangerouslySetInnerHTML={{ __html: qr }} data-testid="poster-qr" />
        <p className="mt-4 break-all text-sm text-on-surface-variant">{url}</p>
        <ol className="mt-10 grid w-full grid-cols-2 gap-5 text-left">
          {steps.map(([n, t, d]) => (
            <li key={n} className="flex items-start gap-3 rounded-2xl bg-surface-low p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: tenant.primaryColor }}>{n}</span>
              <span><b className="block text-lg">{t}</b><span className="text-sm text-on-surface-variant">{d}</span></span>
            </li>
          ))}
        </ol>
        <p className="mt-auto pt-10 text-sm text-on-surface-variant">Online payment only · Cards, Apple Pay &amp; Google Pay</p>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-on-surface-variant"><span>Ordering by</span><LogoImage variant="horizontal" height={20} /></div>
        <PoweredBy className="mt-2" />
      </div>
    </div>
  );
}
