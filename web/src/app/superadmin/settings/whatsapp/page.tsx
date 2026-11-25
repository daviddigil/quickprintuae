import { requireSuperadmin } from "@/lib/auth";
import { PageTitle } from "@/components/platform/PageTitle";
import { MetaTechProviderForm } from "@/components/platform/superadmin/MetaTechProviderForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp Tech Provider" };

export default async function WhatsappTechProviderPage() {
  await requireSuperadmin();
  return (
    <>
      <PageTitle title="WhatsApp Tech Provider (Meta)" subtitle="Paste your Meta Tech Provider app credentials here to switch on one-click “Connect WhatsApp” for every shop. No redeploy needed." />
      <MetaTechProviderForm />
    </>
  );
}
