import { loadBannerOffers } from "@/server/offers";
import { OfferBanner } from "./OfferBanner";

/** First live banner offer (the one ending soonest). Renders nothing when there is none. Server component. */
export async function LiveOfferBanner({ locale = "en" }: { locale?: string }) {
  const [offer] = await loadBannerOffers();
  return offer ? <OfferBanner offer={offer} locale={locale} /> : null;
}
