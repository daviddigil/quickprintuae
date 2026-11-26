"use client";

/** "Request a quote" button + form on the product page. STUB: the quotes agent replaces the body, keep this export and props. */
export interface QuoteRequestButtonProps {
  store: string;
  product: { id: string; name: string };
  /** current configurator choices, sent along so the owner sees what the customer was looking at */
  selections?: Record<string, string>;
  quantity?: number;
  label?: string;
}

export function QuoteRequestButton({ label }: QuoteRequestButtonProps) {
  return <button type="button" className="rounded-full border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface">{label ?? "Request a quote"}</button>;
}
