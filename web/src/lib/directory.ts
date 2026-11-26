/** Pure directory types and filtering (client-safe, unit tested). */
export interface DirectoryShop {
  slug: string; name: string; url: string; logoUrl: string | null; color: string;
  emirate: string; area: string | null; address: string | null; hours: string | null;
  phone: string | null; whatsapp: string | null;
}

export interface DirectoryQuery { emirate?: string; area?: string; q?: string }

const norm = (s: string) => s.trim().toLowerCase();

export function filterShops(shops: DirectoryShop[], f: DirectoryQuery): DirectoryShop[] {
  const q = f.q ? norm(f.q) : "";
  return shops.filter((s) =>
    (!f.emirate || s.emirate === f.emirate) &&
    (!f.area || norm(s.area ?? "") === norm(f.area)) &&
    (!q || norm(`${s.name} ${s.area ?? ""} ${s.address ?? ""}`).includes(q)));
}

export function countBy<T extends string>(shops: DirectoryShop[], key: (s: DirectoryShop) => T | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of shops) { const k = key(s); if (k) out[k] = (out[k] ?? 0) + 1; }
  return out;
}

/** Areas that actually have shops in the chosen emirate (so the filter never leads to an empty page). */
export function areasWithShops(shops: DirectoryShop[], emirate?: string): string[] {
  const set = new Set<string>();
  for (const s of shops) if ((!emirate || s.emirate === emirate) && s.area) set.add(s.area);
  return [...set].sort((a, b) => a.localeCompare(b));
}
