function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function discoveryLimit(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

export function discoveryIntervalDays() {
  return discoveryLimit("DISCOVERY_INTERVAL_DAYS", 7);
}

export function relevanceScore(text: string, seeds: string[]) {
  const hay = text.toLowerCase();
  const usable = seeds.map((seed) => seed.toLowerCase().trim()).filter((seed) => seed.length > 1);
  if (!usable.length || !hay.trim()) return 0;
  let hits = 0;
  for (const seed of usable) {
    const parts = seed.split(/[^a-z0-9]+/).filter((part) => part.length > 2);
    if (!parts.length) continue;
    if (parts.every((part) => hay.includes(part))) hits += 1;
    else if (parts.some((part) => part.length > 4 && hay.includes(part))) hits += 0.35;
  }
  return Math.min(1, hits / Math.min(4, usable.length));
}

export function communityScore(input: {
  subscribers: number | null;
  postsPerDay: number | null;
  relevance: number;
  growth: number | null;
}) {
  const audience = input.subscribers == null ? 20 : clamp((Math.log10(1 + input.subscribers) / 6) * 100, 0, 100);
  const pace = input.postsPerDay == null ? 20 : clamp((input.postsPerDay / 8) * 100, 0, 100);
  const relevance = clamp(input.relevance, 0, 1) * 100;
  let growth = 0;
  if (input.growth != null && input.growth >= 0.05) growth = 10;
  else if (input.growth != null && input.growth <= -0.1) growth = -8;
  return clamp(Math.round(0.35 * audience + 0.25 * pace + 0.4 * relevance + growth), 0, 100);
}

export function accountScore(input: {
  followers: number | null;
  postsPerDay: number | null;
  engagementRate: number | null;
  relevance: number;
  mentions: number | null;
}) {
  const audience =
    input.followers == null
      ? clamp((input.mentions ?? 0) * 14, 0, 80)
      : clamp((Math.log10(1 + input.followers) / 6) * 100, 0, 100);
  const pace = input.postsPerDay == null ? (input.mentions ? 28 : 12) : clamp((input.postsPerDay / 6) * 100, 0, 100);
  const engage =
    input.engagementRate == null ? 16 : clamp((Math.log10(1 + input.engagementRate * 1000) / 2) * 100, 0, 100);
  const relevance = clamp(input.relevance, 0, 1) * 100;
  return clamp(Math.round(0.3 * audience + 0.2 * pace + 0.2 * engage + 0.3 * relevance), 0, 100);
}

export function heatScore(input: {
  audience: number | null;
  perDay: number | null;
  avgEngagement: number | null;
  trend: number | null;
}) {
  const audience = input.audience == null ? 0 : clamp((Math.log10(1 + input.audience) / 6) * 100, 0, 100);
  const pace = input.perDay == null ? 0 : clamp((input.perDay / 8) * 100, 0, 100);
  const engage = input.avgEngagement == null ? 0 : clamp((Math.log10(1 + input.avgEngagement) / 3.5) * 100, 0, 100);
  let score = 0.4 * audience + 0.3 * pace + 0.3 * engage;
  if (input.trend != null && input.trend >= 1.25) score += 8;
  if (input.trend != null && input.trend <= 0.75) score -= 8;
  return clamp(Math.round(score), 0, 100);
}

export function postsPerDay(timestamps: number[], now: number) {
  const week = timestamps.filter((time) => now - time <= 7 * 86400000 && time <= now);
  return week.length / 7;
}

export function engagementTrend(recent: number[], prior: number[]) {
  if (!recent.length && !prior.length) return null;
  const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const before = avg(prior);
  const after = avg(recent);
  if (before <= 0) return after > 0 ? 2 : null;
  return after / before;
}

export type DiscussionType = "ask" | "pain" | "compare" | "recommend" | "other";

export function classifyDiscussion(text: string): DiscussionType {
  const value = text.toLowerCase();
  if (/\b(vs\.?|versus|alternative to|compared to|compare)\b/.test(value)) return "compare";
  if (
    /\b(is there (a|an|any)|looking for (an? |the )?(tool|app|software)|anyone know (a|an)|does anyone have|need a tool|tool that|app that)\b/.test(
      value,
    )
  ) {
    return "ask";
  }
  if (/\b(i recommend|check out|you should try|just launched|highly recommend|we built)\b/.test(value)) return "recommend";
  if (/\b(frustrat\w*|annoy\w*|hate|sucks|rant|wish there was|doesn'?t work|too expensive|pain|complaint)\b/.test(value)) {
    return "pain";
  }
  return "other";
}

export type PoolItem = {
  key: string;
  score: number;
  origin: string;
  status: "active" | "paused";
  pinned: boolean;
  reason: string;
};

export function rebalanceSources(active: PoolItem[], candidates: PoolItem[], limit: number, blocked: string[] = []) {
  const block = new Set(blocked.map((key) => key.toLowerCase()));
  const paused = active.filter((item) => item.status === "paused");
  const pinned = active.filter((item) => item.pinned && item.status === "active");
  const floating = active.filter((item) => !item.pinned && item.status === "active");
  const slots = Math.max(0, limit - pinned.length);
  const pool = new Map<string, PoolItem>();
  for (const item of floating) pool.set(item.key.toLowerCase(), item);
  for (const item of candidates) {
    const key = item.key.toLowerCase();
    if (block.has(key) || pinned.some((row) => row.key.toLowerCase() === key)) continue;
    const previous = pool.get(key);
    if (!previous || item.score > previous.score) pool.set(key, { ...item, status: "active", pinned: false });
  }
  const chosen = [...pool.values()].sort((a, b) => b.score - a.score).slice(0, slots);
  const chosenKeys = new Set(chosen.map((item) => item.key.toLowerCase()));
  const activeKeys = new Set(active.map((item) => item.key.toLowerCase()));
  const add = chosen.filter((item) => !activeKeys.has(item.key.toLowerCase()));
  const retire = floating
    .filter((item) => !chosenKeys.has(item.key.toLowerCase()))
    .map((item) => ({ key: item.key, reason: item.score < 25 ? "热度和相关度都不够，退出自动名单" : "本周排名落到自动名额之外" }));
  return { add, retire, kept: chosen.length + pinned.length + paused.length };
}

export function shouldRetire(input: {
  pinned: boolean;
  postsPerDay: number | null;
  relevance: number | null;
  lastPostAt: string | null;
  now: number;
}) {
  if (input.pinned) return { retire: false, reason: "" };
  if (input.postsPerDay == null && input.relevance == null && !input.lastPostAt) return { retire: false, reason: "" };
  const last = input.lastPostAt ? Date.parse(input.lastPostAt) : NaN;
  const inactiveDays = Number.isFinite(last) ? (input.now - last) / 86400000 : null;
  if (inactiveDays != null && inactiveDays > 21) return { retire: true, reason: "超过 21 天没有新内容" };
  if ((input.postsPerDay ?? 0) < 0.15 && (input.relevance ?? 0) < 0.12) {
    return { retire: true, reason: "几乎没有新帖，而且和行业种子对不上" };
  }
  if ((input.relevance ?? 1) < 0.05 && (input.postsPerDay ?? 0) < 1) {
    return { retire: true, reason: "讨论内容和本行业种子基本无关" };
  }
  return { retire: false, reason: "" };
}

export function redditSpreadBoost(rows: { channel: string; at: string }[], now: number) {
  const recentCut = now - 7 * 86400000;
  const priorCut = now - 14 * 86400000;
  const recent = new Set<string>();
  const prior = new Set<string>();
  const all = new Set<string>();
  for (const row of rows) {
    const channel = row.channel.toLowerCase();
    if (!channel) continue;
    all.add(channel);
    const time = Date.parse(row.at);
    if (!Number.isFinite(time)) continue;
    if (time >= recentCut) recent.add(channel);
    else if (time >= priorCut) prior.add(channel);
  }
  let boost = 0;
  if (all.size >= 2) boost += Math.min(16, (all.size - 1) * 4);
  if (recent.size >= 2 && recent.size > prior.size) boost += 6;
  return boost;
}

const HANDLE_SKIP = new Set(["home", "share", "intent", "search", "explore", "privacy", "login", "signup", "i", "hashtag", "tos", "settings"]);

export function extractXHandles(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\b/gi)) {
    const handle = match[1].toLowerCase();
    if (!HANDLE_SKIP.has(handle)) found.add(handle);
  }
  for (const match of text.matchAll(/(?:^|[^\w@])@([A-Za-z0-9_]{2,15})\b/g)) {
    const handle = match[1].toLowerCase();
    if (!HANDLE_SKIP.has(handle)) found.add(handle);
  }
  return [...found];
}

export function parseXInput(raw: string) {
  const found = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    if (!part.trim()) continue;
    const fromUrl = part.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i);
    const handle = (fromUrl?.[1] || part.replace(/^@/, "")).toLowerCase();
    if (/^[a-z0-9_]{2,15}$/.test(handle) && !HANDLE_SKIP.has(handle)) found.add(handle);
  }
  return [...found];
}

export function parseSubredditInput(raw: string) {
  const found = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    if (!part.trim()) continue;
    const fromUrl = part.match(/reddit\.com\/r\/([A-Za-z0-9_]{3,21})/i);
    const name = fromUrl?.[1] || part.replace(/^\/?r\//i, "");
    if (/^[A-Za-z0-9_]{3,21}$/.test(name)) found.add(name);
  }
  return [...found];
}

export function extractSubreddits(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/reddit\.com\/r\/([A-Za-z0-9_]{3,21})/gi)) found.add(match[1]);
  for (const match of text.matchAll(/(?:^|[^\w])\/r\/([A-Za-z0-9_]{3,21})\b/g)) found.add(match[1]);
  return [...found];
}
