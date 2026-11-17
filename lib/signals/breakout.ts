export type BreakoutThresholds = {
  maxAgeDays: number;
  starsPerDay: number;
  starDelta: number;
};

export function defaultBreakoutThresholds(): BreakoutThresholds {
  return {
    maxAgeDays: numberFromEnv("GITHUB_BREAKOUT_MAX_AGE_DAYS", 14),
    starsPerDay: numberFromEnv("GITHUB_BREAKOUT_STARS_PER_DAY", 200),
    starDelta: numberFromEnv("GITHUB_BREAKOUT_STAR_DELTA", 400),
  };
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function classifyBreakout(input: {
  createdAt: string | null;
  stars: number;
  previousStars: number | null;
  now?: number;
  thresholds?: BreakoutThresholds;
}): { breakout: boolean; reason: string } {
  const thresholds = input.thresholds ?? defaultBreakoutThresholds();
  const now = input.now ?? Date.now();
  const created = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  if (Number.isFinite(created)) {
    const ageDays = Math.max((now - created) / 86400000, 1 / 24);
    if (ageDays < thresholds.maxAgeDays && input.stars / ageDays >= thresholds.starsPerDay) {
      return { breakout: true, reason: `新建不足 ${thresholds.maxAgeDays} 天，日均星标达到 ${thresholds.starsPerDay}` };
    }
  }
  if (input.previousStars != null && input.stars - input.previousStars >= thresholds.starDelta) {
    return { breakout: true, reason: `距上次快照增加至少 ${thresholds.starDelta} 星` };
  }
  return { breakout: false, reason: "" };
}

export function splitRepoToken(token: string) {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function repoSearchVariants(fullName: string) {
  const [owner = "", name = ""] = fullName.split("/");
  const display = splitRepoToken(name);
  const values = [name.replace(/[-_]/g, " "), display, owner && name ? `${splitRepoToken(owner)} ${display}` : ""];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase().replace(/\s+/g, " ").trim();
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}
