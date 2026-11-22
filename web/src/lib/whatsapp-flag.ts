/** WhatsApp ordering is built but shipped "Coming soon". Flip WHATSAPP_ENABLED=1 to turn everything on. */
export const whatsappEnabled = () => ["1", "true"].includes(process.env.WHATSAPP_ENABLED ?? "");
export const whatsappFake = () => ["1", "true"].includes(process.env.WHATSAPP_FAKE ?? "");
export const COMING_SOON = { error: "WhatsApp ordering is coming soon" } as const;
