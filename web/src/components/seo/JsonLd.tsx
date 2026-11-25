import { jsonLdString, type LdNode } from "@/lib/seo/jsonld";

/** Renders one schema.org @graph. Server component; output is escaped by jsonLdString (safe against </script> injection). */
export function JsonLd({ data }: { data: LdNode | LdNode[] }) {
  const nodes = Array.isArray(data) ? data : [data];
  if (!nodes.length) return null;
  const payload = { "@context": "https://schema.org", "@graph": nodes };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(payload) }} />;
}
