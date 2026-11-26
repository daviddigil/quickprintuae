export const runtime = "nodejs";

/** Alias of the one platform Stripe webhook (/api/webhooks/stripe), kept so an endpoint registered earlier at this URL keeps working. */
export { POST } from "../stripe/route";
