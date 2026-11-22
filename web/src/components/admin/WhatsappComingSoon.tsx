import { Bot, Link2, MessageCircle, ShieldCheck, Smartphone, UserRoundCheck } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";

const FEATURES = [
  { icon: Smartphone, title: "Keep your WhatsApp Business app", text: "Coexistence lets the same number work in the WhatsApp Business app on your phone and through the official Cloud API at once." },
  { icon: Bot, title: "AI takes the order", text: "Customers chat naturally in English or Arabic. The AI answers product questions, quotes exact prices from your price list and sends a secure checkout link." },
  { icon: UserRoundCheck, title: "You can jump in any time", text: "Reply from your phone and the AI steps aside for that chat automatically, then you can hand it back." },
  { icon: ShieldCheck, title: "Online payment only", text: "Files, delivery details and payment happen on your checkout page — never inside the chat. No cash on delivery." },
];
const STEPS = ["Connect your WhatsApp Business number with Meta's secure sign-up", "Customers message you: “100 business cards, matte”", "AI replies with the exact price and a checkout link", "Customer uploads files and pays; the order lands in your queue"];

export function WhatsappComingSoon() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="whatsapp-coming-soon">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 text-white">
          <div className="mb-3 flex items-center gap-3"><MessageCircle className="h-8 w-8" /><Badge tone="yellow">Coming soon</Badge></div>
          <h1 className="text-2xl font-bold sm:text-3xl">WhatsApp orders with AI replies</h1>
          <p className="mt-2 max-w-2xl text-emerald-50">Let customers order from the chat they already use. Your AI assistant answers, quotes and sends checkout links, while you keep full control from your own WhatsApp Business app.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button disabled className="bg-white/90 text-emerald-900" title="Available soon"><Link2 className="h-4 w-4" />Connect WhatsApp</Button>
            <span className="text-sm text-emerald-100">We&apos;ll enable this for your shop as soon as it launches.</span>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: I, title, text }) => (
          <Card key={title} className="p-5"><I className="mb-2 h-6 w-6 text-emerald-600" /><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-600">{text}</p></Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">How it will work</h3>
        <ol className="space-y-2 text-sm text-slate-700">{STEPS.map((s, i) => <li key={s} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{i + 1}</span>{s}</li>)}</ol>
      </Card>
    </div>
  );
}
