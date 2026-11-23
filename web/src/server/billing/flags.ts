import { z } from "zod";

/** Plan feature flags (machine-readable). Adding a flag = one entry here; the plan form, validation and displays pick it up. */
export const PLAN_FLAGS = [
  { key: "walk_in_queue", label: "Walk-in QR print queue", description: "QR code in the shop → customers upload documents, pay online, jobs print through a priority queue." },
] as const;

export type PlanFlag = (typeof PLAN_FLAGS)[number]["key"];
export const PLAN_FLAG_KEYS = PLAN_FLAGS.map((f) => f.key) as [PlanFlag, ...PlanFlag[]];
export const flagLabel = (k: string) => PLAN_FLAGS.find((f) => f.key === k)?.label ?? k;

const FlagList = z.array(z.enum(PLAN_FLAG_KEYS));
/** Validates raw form values against PLAN_FLAGS. Returns de-duplicated flags or null when anything is unknown. */
export function parsePlanFlags(values: unknown[]): PlanFlag[] | null {
  const r = FlagList.safeParse(values);
  return r.success ? [...new Set(r.data)] : null;
}

/** Marketing bullet list for a plan: adds a line for each enabled flag that the text doesn't already mention. */
export function displayFeatures(features: string[], flags: string[] = []): string[] {
  const out = [...features];
  for (const key of flags) {
    const label = flagLabel(key);
    if (!out.some((f) => f.toLowerCase().includes(label.toLowerCase()))) out.push(label);
  }
  return out;
}
