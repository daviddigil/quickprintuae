import "server-only";
import { getSetting, setSetting } from "./platform-settings";
import { DEFAULT_PLATFORM_IDENTITY, normalizePlatformIdentity, PLATFORM_IDENTITY_KEY, type PlatformIdentity } from "@/lib/platform-identity";

export async function getPlatformIdentity(): Promise<PlatformIdentity> {
  return normalizePlatformIdentity(await getSetting<unknown>(PLATFORM_IDENTITY_KEY, DEFAULT_PLATFORM_IDENTITY));
}

export async function setPlatformIdentity(value: unknown, by?: string | null): Promise<PlatformIdentity> {
  const v = normalizePlatformIdentity(value);
  await setSetting(PLATFORM_IDENTITY_KEY, v, by);
  return v;
}
