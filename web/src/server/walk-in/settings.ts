import "server-only";
import type { Tenant } from "@/db/schema";
import { DEFAULT_WALK_IN, type WalkInSettings } from "@/lib/types";

export const walkInSettings = (t: Pick<Tenant, "settings">): WalkInSettings => ({ ...DEFAULT_WALK_IN, ...(t.settings?.walkIn ?? {}) });
