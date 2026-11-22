/** Fonts available in the designer and to the AI. Google Fonts are loaded by the designer via <link>. */
export const CARD_FONTS = [
  "Inter", "Montserrat", "Poppins", "Playfair Display", "Lora", "Raleway", "Oswald", "Roboto Slab",
  "Cairo", "Tajawal", "Georgia", "Arial",
] as const;
export type CardFont = (typeof CARD_FONTS)[number];

export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  ["Inter:wght@400;500;600;700;800", "Montserrat:wght@400;500;600;700;800", "Poppins:wght@400;500;600;700;800",
   "Playfair+Display:wght@400;600;700;800", "Lora:wght@400;500;600;700", "Raleway:wght@400;500;600;700;800",
   "Oswald:wght@400;500;600;700", "Roboto+Slab:wght@400;500;600;700;800", "Cairo:wght@400;600;700;800", "Tajawal:wght@400;500;700;800"]
    .map((f) => `family=${f}`).join("&") + "&display=swap";

export const fontStack = (f: string) =>
  f === "Georgia" || f === "Playfair Display" || f === "Lora" || f === "Roboto Slab"
    ? `"${f}", Georgia, serif` : `"${f}", Arial, Helvetica, sans-serif`;

/** pt → mm */
export const PT_MM = 0.3528;
