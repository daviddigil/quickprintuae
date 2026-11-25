import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`, short_name: SITE.name, description: SITE.description,
    start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#3300ff", lang: "en", dir: "ltr",
    categories: ["business", "productivity"],
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
