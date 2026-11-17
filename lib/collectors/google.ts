import { normalize, withinDays } from "../extract";
import { fetchText } from "../http";
import { readFeed } from "../rss";
import { result, type CollectorResult } from "./types";

export type TermCheck = { id: number; display: string; normalized: string; region: string };

function glOf(region: string) {
  if (region === "GB") return "uk";
  if (region === "CA") return "ca";
  if (region === "AU") return "au";
  return "us";
}

async function suggestions(query: string, region: string) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=${glOf(region)}&q=${encodeURIComponent(query)}`;
  const res = await fetchText(url, { intervalMs: 350, timeoutMs: 8000, hostKey: "suggestqueries.google.com" });
  if (!res.ok) return [];
  try {
    const json = JSON.parse(res.text) as [string, string[]];
    return (json[1] ?? []).map((item) => normalize(item));
  } catch {
    return [];
  }
}

export async function validateGoogle(terms: TermCheck[]): Promise<CollectorResult & { updates: { id: number; suggest: boolean; trends: boolean }[] }> {
  const updates: { id: number; suggest: boolean; trends: boolean }[] = [];
  const trending = new Set<string>();
  let trendsNote = "每日趋势 RSS 已读取";
  try {
    const entries = await readFeed("https://trends.google.com/trending/rss?geo=US", { intervalMs: 400, hostKey: "trends.google.com" });
    for (const entry of entries) {
      if (!withinDays(entry.date, 3)) continue;
      const title = normalize(entry.title);
      if (title) trending.add(title);
    }
  } catch {
    trendsNote = "每日趋势 RSS 失败";
  }

  let suggestHits = 0;
  let trendHits = 0;
  let suggestErrors = 0;
  for (const term of terms.slice(0, 24)) {
    const prefix = term.normalized.length > 4 ? term.normalized.slice(0, -1) : term.normalized;
    let suggest = false;
    try {
      const list = await suggestions(prefix, term.region || "US");
      suggest = list.some((item) => item === term.normalized || item.startsWith(`${term.normalized} `));
    } catch {
      suggestErrors += 1;
    }
    const trends =
      trending.has(term.normalized) ||
      (term.normalized.split(" ").length >= 2 && [...trending].some((title) => title.includes(term.normalized)));
    if (suggest) suggestHits += 1;
    if (trends) trendHits += 1;
    updates.push({ id: term.id, suggest, trends });
  }

  const explore = await fetchText("https://trends.google.com/trends/", { browser: true, timeoutMs: 8000, hostKey: "trends.google.com" });
  const exploreNote = explore.status === 429 || explore.status === 0 ? "相关查询接口仍容易 429，本轮没有用它做发现。" : "已预热 Trends 会话；相关查询不写入发现词。";
  const message = `验证 ${updates.length} 个词：自动补全命中 ${suggestHits}，每日趋势命中 ${trendHits}。${trendsNote}。${exploreNote}${suggestErrors ? ` 补全失败 ${suggestErrors} 次。` : ""}`;
  return { ...result("google", updates.length || trending.size ? "ok" : "error", message), updates };
}
