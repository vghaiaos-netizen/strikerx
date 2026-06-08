import { getConfig, getConfigFloat } from "./configService";

/**
 * Returns the active match event bonus multiplier (e.g. 1.5).
 * Returns 1.0 when no match event is active — callers can always multiply by this.
 */
export async function getMatchEventBonus(): Promise<number> {
  try {
    const active = await getConfig("match_event_active").catch(() => "");
    if (active !== "true") return 1.0;

    const endsAt = await getConfig("match_event_ends_at").catch(() => "");
    if (endsAt && new Date(endsAt).getTime() < Date.now()) return 1.0;

    const bonus = await getConfigFloat("match_event_bonus_multiplier", 1.0);
    return bonus > 1.0 ? bonus : 1.0;
  } catch {
    return 1.0;
  }
}
