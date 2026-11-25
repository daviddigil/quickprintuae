import { requireStaff } from "@/lib/auth";
import { whatsappEnabled } from "@/lib/whatsapp-flag";
import { PageHeader } from "@/components/admin/PageHeader";
import { WhatsappPanel } from "@/components/admin/WhatsappPanel";
import { Alert } from "@/components/ui";

export const metadata = { title: "WhatsApp" };
export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const { user } = await requireStaff();
  if (!whatsappEnabled()) {
    return (
      <div>
        <PageHeader title="WhatsApp orders" />
        <Alert tone="yellow">WhatsApp is switched off on this platform (WHATSAPP_ENABLED=0). Ask the platform administrator to turn it on.</Alert>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="WhatsApp orders" subtitle="Customers chat on WhatsApp, AI answers and builds their cart, and sends a checkout link — you stay in control and can reply from your phone at any time." />
      <WhatsappPanel isOwner={user.role === "owner"} />
    </div>
  );
}
