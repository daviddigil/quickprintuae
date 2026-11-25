import { ImageResponse } from "next/og";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#e11d48");

/** Social-share image for a shop (WhatsApp / Facebook / X link previews): shop name, emirate and brand colour. */
export async function GET(_req: Request, ctx: { params: Promise<{ tenant: string }> }) {
  const t = await resolveTenant((await ctx.params).tenant);
  const name = t?.name ?? "Print shop", emirate = t?.emirate ?? "UAE", color = safeColor(t?.primaryColor ?? "");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "white", background: `linear-gradient(135deg, ${color} 0%, #0f172a 100%)`, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 88, height: 88, borderRadius: 24, background: "white", color, fontSize: 56, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>{name.charAt(0).toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>{name.slice(0, 60)}</div>
          <div style={{ display: "flex", fontSize: 34, opacity: 0.92 }}>Online printing in {emirate} · Pickup or delivery</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.8 }}>Documents · Photos · Business cards · Flyers</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
