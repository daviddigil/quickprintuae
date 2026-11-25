import { ImageResponse } from "next/og";
import { SITE } from "@/lib/seo/site";

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips = ["Walk-in QR queue", "WhatsApp AI orders", "Mamo Pay & Stripe", "UAE VAT invoices"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, color: "white", background: "linear-gradient(135deg, #3300ff 0%, #ff007f 55%, #1d1e3a 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "white", color: "#3300ff", fontSize: 48, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>Q</div>
          <div style={{ fontSize: 44, fontWeight: 800, display: "flex" }}>{SITE.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, display: "flex" }}>Your print shop, online in minutes.</div>
          <div style={{ fontSize: 30, opacity: 0.9, display: "flex" }}>Documents, photos, business cards and more — for UAE print shops.</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {chips.map((c) => (
            <div key={c} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 24 }}>{c}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
