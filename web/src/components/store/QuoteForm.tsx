"use client";
import { useId, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button, Field, Input, Textarea, Alert } from "@/components/ui";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "@/components/security/TurnstileWidget";
import { FileUploader, type UploadedFile } from "./file-uploader";

/** "Request a quote" button + dialog on the product page. */
export interface QuoteRequestButtonProps {
  store: string;
  product: { id: string; name: string };
  /** current configurator choices, sent along so the owner sees what the customer was looking at */
  selections?: Record<string, string>;
  quantity?: number;
  label?: string;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.svg,.ai,.eps,.doc,.docx";

export function QuoteRequestButton({ store, product, selections, quantity, label }: QuoteRequestButtonProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [qty, setQty] = useState<string>("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);

  function open() {
    setQty(quantity ? String(quantity) : "");
    dlg.current?.showModal();
  }
  function close() { dlg.current?.close(); }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setState("sending");
    try {
      const q = Number(qty);
      const res = await fetch(`/api/v1/store/${store}/quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email") ?? "", message: fd.get("message"),
          website: fd.get("website") ?? "", quantity: Number.isInteger(q) && q > 0 ? q : null,
          productId: product.id, selections: selections ?? {}, fileIds: files.map((f) => f.id), captchaToken: captcha ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("form");
      if (TURNSTILE_SITE_KEY) { setCaptcha(null); setCaptchaRound((n) => n + 1); } // a token works once
    }
  }

  return (
    <>
      <button ref={opener} type="button" onClick={open} data-testid="quote-open"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-outline px-5 text-sm font-semibold text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {label ?? "Request a quote"}
      </button>
      <dialog ref={dlg} aria-labelledby={titleId} onClose={() => { if (state === "done") { setState("form"); setFiles([]); } opener.current?.focus(); }}
        onClick={(e) => { if (e.target === dlg.current) close(); }}
        className="m-auto w-[min(32rem,calc(100vw-1.5rem))] max-h-[90vh] overflow-y-auto rounded-shape-lg border border-outline-variant bg-surface-lowest p-0 text-on-surface shadow-elev-3 backdrop:bg-black/50" data-testid="quote-dialog">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-lg font-bold">{state === "done" ? "Request sent" : "Request a quote"}</h2>
              <p className="text-sm text-on-surface-variant">{product.name}</p>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="grid size-11 place-items-center rounded-full hover:bg-surface-container"><X size={20} /></button>
          </div>
          {state === "done" ? (
            <div className="space-y-4 text-center" role="status" data-testid="quote-success">
              <CheckCircle2 className="mx-auto text-success" size={44} aria-hidden />
              <p className="font-semibold">Thank you, we have your request.</p>
              <p className="text-sm text-on-surface-variant">The shop will reply on WhatsApp or by phone, usually within one working day. You do not need to do anything else.</p>
              <Button type="button" onClick={close} className="min-h-11">Close</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate={false}>
              <Field label="Your name"><Input name="name" required minLength={2} maxLength={120} autoComplete="name" /></Field>
              <Field label="Mobile number" hint="UAE, e.g. 050 123 4567"><Input name="phone" type="tel" inputMode="tel" required maxLength={30} autoComplete="tel" /></Field>
              <Field label="Email" hint="(optional)"><Input name="email" type="email" maxLength={200} autoComplete="email" /></Field>
              <Field label="Quantity"><Input name="quantity" type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
              <Field label="What do you need?" hint="(max 1000 characters)"><Textarea name="message" required minLength={5} maxLength={1000} rows={4} placeholder="Tell the shop about your event, deadline, items to include, branding…" /></Field>
              <div>
                <p className="mb-1.5 text-sm font-medium">Artwork or reference files <span className="font-normal text-on-surface-variant">(optional)</span></p>
                <FileUploader store={store} productId={product.id} accept={ACCEPT} multiple files={files} onChange={setFiles} />
              </div>
              {/* honeypot: hidden from people and assistive tech */}
              <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <TurnstileWidget key={captchaRound} onToken={setCaptcha} />
              {error && <div role="alert"><Alert tone="red">{error}</Alert></div>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={close} className="min-h-11">Cancel</Button>
                <Button type="submit" disabled={state === "sending" || (!!TURNSTILE_SITE_KEY && !captcha)} className="min-h-11" data-testid="quote-submit">{state === "sending" ? "Sending…" : "Send request"}</Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
