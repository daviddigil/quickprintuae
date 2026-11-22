import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { whatsappEnabled } from "@/lib/whatsapp-flag";
import { PageHeader } from "@/components/admin/PageHeader";
import { WhatsappComingSoon } from "@/components/admin/WhatsappComingSoon";
import { WhatsappPanel } from "@/components/admin/WhatsappPanel";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  await requireStaff();
  if (!whatsappEnabled()) return <WhatsappComingSoon />;
  return (
    <div>
      <PageHeader title="WhatsApp orders" subtitle="Receive orders on WhatsApp and let AI reply — you stay in control." />
      <WhatsappPanel meta={{ appId: env.metaAppId, configId: env.metaEmbeddedSignupConfigId, graphVersion: env.metaGraphVersion }} />
    </div>
  );
}
