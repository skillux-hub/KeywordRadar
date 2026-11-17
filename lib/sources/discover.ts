import { INDUSTRIES } from "../catalog";
import { all, get, run } from "../db";
import { fetchJson, fetchText } from "../http";
import { readCache, writeCache } from "./cache";
import {
  accountScore,
  communityScore,
  discoveryLimit,
  extractSubreddits,
  extractXHandles,
  relevanceScore,
  rebalanceSources,
  shouldRetire,
  type PoolItem,
} from "./metrics";
import { searchXPosts } from "./x-provider";

const UA = "web:keywordradar:1.0 (community discovery; contact local operator)";
const INDUSTRY_QUERY: Record<string, string> = {
  ai: "artificial intelligence",
  saas: "saas startup",
  crypto: "cryptocurrency",
  ecommerce: "shopify ecommerce",
  marketing: "seo marketing",
  health: "fitness health",
  gaming: "video games",
  finance: "personal finance",
};

type Candidate = { key: string; score: number; reason: string; relevance: number };

function seedsFor(industry: string) {
  const rows = all<{ topic: string }>("select topic from seeds where active = 1 and industry = ?", industry).map((row) => row.topic);
  return rows.length ? rows : [INDUSTRY_QUERY[industry] || industry];
}

function queriesFor(industry: string) {
  return [...seedsFor(industry)].slice(0, 1);
}

async function cachedGet(url: string, key: string, host: string, intervalMs: number, bypass: boolean) {
  if (!bypass) {
    const cached = readCache(key, 12 * 3600000);
    if (cached) {
      try {
        return JSON.parse(cached) as unknown;
      } catch {
        /* refetch */
      }
    }
  }
  const requestHeaders: Record<string, string> = { "user-agent": UA, accept: "application/json" };
  if (host === "api.github.com" && process.env.GITHUB_TOKEN) requestHeaders.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchJson(url, {
    intervalMs,
    timeoutMs: 12000,
    hostKey: host,
    headers: requestHeaders,
  });
  if (!res.ok || res.data == null) return null;
  writeCache(key, JSON.stringify(res.data));
  return res.data;
}

function children(json: unknown) {
  const data = (json as { data?: { children?: { data?: Record<string, unknown> }[] } } | null)?.data?.children ?? [];
  return data.map((child) => child.data).filter((row): row is Record<string, unknown> => Boolean(row));
}

export async function runDiscovery(trigger: string, bypass = false) {
  const started = new Date().toISOString();
  const id = Number(run("insert into discovery_runs (started_at, trigger, candidates, added, retired) values (?, ?, 0, 0, 0)", started, trigger).lastInsertRowid);
  let candidates = 0;
  let added = 0;
  let retired = 0;
  const notes: string[] = [];
  try {
    const subs = await discoverSubreddits(bypass, id);
    const accounts = await discoverAccounts(bypass, id);
    candidates = subs.candidates + accounts.candidates;
    added = subs.added + accounts.added;
    retired = subs.retired + accounts.retired;
    notes.push(`板块候选 ${subs.candidates}，加入 ${subs.added}，退出 ${subs.retired}`);
    notes.push(`账号候选 ${accounts.candidates}，加入 ${accounts.added}，退出 ${accounts.retired}`);
    if (accounts.notice) notes.push(accounts.notice);
  } catch (error) {
    notes.push(error instanceof Error ? error.message : "发现失败");
  }
  const message = notes.join("。");
  run(
    "update discovery_runs set finished_at = ?, candidates = ?, added = ?, retired = ?, message = ? where id = ?",
    new Date().toISOString(),
    candidates,
    added,
    retired,
    message,
    id,
  );
  run("insert into meta (key, value) values ('discovery_last_at', ?) on conflict(key) do update set value = excluded.value", new Date().toISOString());
  return { candidates, added, retired, message };
}

export function discoveryDue(now = Date.now()) {
  const last = get<{ value: string }>("select value from meta where key = 'discovery_last_at'")?.value;
  if (!last) return true;
  const time = Date.parse(last);
  if (!Number.isFinite(time)) return true;
  return now - time >= discoveryLimit("DISCOVERY_INTERVAL_DAYS", 7) * 86400000;
}

async function discoverSubreddits(bypass: boolean, runId: number) {
  const limit = discoveryLimit("SUBREDDIT_DISCOVERY_LIMIT", 15);
  let candidates = 0;
  let added = 0;
  let retired = 0;
  let calls = 0;
  const found = new Map<string, Candidate & { subscribers: number | null; text: string }>();
  for (const industry of INDUSTRIES) {
    if (calls >= 20) break;
    const query = queriesFor(industry.slug)[0];
    const search = await cachedGet(
      `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}&limit=15&include_over_18=off`,
      `reddit:subs:${industry.slug}:${query}`,
      "www.reddit.com",
      1600,
      bypass,
    );
    calls += 1;
    for (const row of children(search)) {
      const name = String(row.display_name || "");
      if (!/^[A-Za-z0-9_]{3,21}$/.test(name)) continue;
      const text = `${row.title || ""} ${row.public_description || ""}`;
      const key = `${industry.slug}:${name.toLowerCase()}`;
      found.set(key, {
        key: name,
        score: 0,
        reason: `板块搜索「${query}」出现`,
        relevance: relevanceScore(text, seedsFor(industry.slug)),
        subscribers: typeof row.subscribers === "number" ? row.subscribers : null,
        text,
      });
    }
    if (calls >= 20) break;
    const posts = await cachedGet(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=month&limit=15&type=link`,
      `reddit:posts:${industry.slug}:${query}`,
      "www.reddit.com",
      1600,
      bypass,
    );
    calls += 1;
    for (const row of children(posts)) {
      const name = String(row.subreddit || "");
      if (!/^[A-Za-z0-9_]{3,21}$/.test(name)) continue;
      const text = `${row.title || ""} ${row.selftext || ""}`;
      const key = `${industry.slug}:${name.toLowerCase()}`;
      const previous = found.get(key);
      found.set(key, {
        key: name,
        score: 0,
        reason: previous?.reason || `搜索「${query}」的帖子来自 r/${name}`,
        relevance: Math.max(previous?.relevance ?? 0, relevanceScore(text, seedsFor(industry.slug))),
        subscribers: previous?.subscribers ?? (typeof row.subreddit_subscribers === "number" ? row.subreddit_subscribers : null),
        text: `${previous?.text || ""} ${text}`,
      });
    }
  }
  const terms = all<{ display: string; industry: string }>(
    `select t.display, i.industry from terms t join term_industries i on i.term_id = t.id
     order by t.opportunity_score desc limit 16`,
  );
  for (const term of terms) {
    if (calls >= 24) break;
    const posts = await cachedGet(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(term.display)}&sort=new&t=month&limit=10&type=link`,
      `reddit:term:${term.industry}:${term.display.toLowerCase()}`,
      "www.reddit.com",
      1600,
      bypass,
    );
    calls += 1;
    for (const row of children(posts)) {
      const name = String(row.subreddit || "");
      if (!name) continue;
      const key = `${term.industry}:${name.toLowerCase()}`;
      if (found.has(key)) continue;
      found.set(key, {
        key: name,
        score: 0,
        reason: `雷达词「${term.display}」出现在 r/${name}`,
        relevance: relevanceScore(`${row.title || ""} ${row.selftext || ""}`, seedsFor(term.industry)),
        subscribers: typeof row.subreddit_subscribers === "number" ? row.subreddit_subscribers : null,
        text: String(row.title || ""),
      });
    }
  }
  const tracked = all<{ industry: string; name: string }>("select industry, name from subreddits where status = 'active' order by coalesce(stats_at, '') limit 4");
  for (const sub of tracked) {
    if (calls >= 28) break;
    const about = await cachedGet(
      `https://www.reddit.com/r/${encodeURIComponent(sub.name)}/about.json?raw_json=1`,
      `reddit:about:${sub.name.toLowerCase()}`,
      "www.reddit.com",
      1600,
      bypass,
    );
    calls += 1;
    const data = (about as { data?: Record<string, unknown> } | null)?.data;
    const blob = `${data?.public_description || ""} ${data?.description || ""}`;
    for (const name of extractSubreddits(blob)) {
      if (name.toLowerCase() === sub.name.toLowerCase()) continue;
      const key = `${sub.industry}:${name.toLowerCase()}`;
      if (found.has(key)) continue;
      found.set(key, {
        key: name,
        score: 0,
        reason: `r/${sub.name} 的侧栏或简介提到`,
        relevance: relevanceScore(blob, seedsFor(sub.industry)),
        subscribers: null,
        text: blob,
      });
    }
  }
  for (const industry of INDUSTRIES) {
    const rows = [...found.entries()].filter(([key]) => key.startsWith(`${industry.slug}:`)).map(([, value]) => value);
    candidates += rows.length;
    const scored: Candidate[] = rows.map((row) => ({
      key: row.key,
      relevance: row.relevance,
      reason: row.reason,
      score: communityScore({ subscribers: row.subscribers, postsPerDay: null, relevance: row.relevance, growth: null }),
    }));
    const ranked = await refineScores(industry.slug, scored, seedsFor(industry.slug));
    recordEvents(runId, "reddit", industry.slug, "candidate", ranked);
    const outcome = applyPool("reddit", industry.slug, ranked, limit);
    recordEvents(runId, "reddit", industry.slug, "added", outcome.add);
    recordEvents(runId, "reddit", industry.slug, "retired", outcome.retire);
    added += outcome.added;
    retired += outcome.retired;
  }
  return { candidates, added, retired };
}

async function discoverAccounts(bypass: boolean, runId: number) {
  const limit = discoveryLimit("X_DISCOVERY_LIMIT", 30);
  let candidates = 0;
  let added = 0;
  let retired = 0;
  const mentions = new Map<string, { count: number; recent: number; text: string }>();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const feeds = all<{ industry: string | null; title: string | null; text: string | null; url: string | null; fetched_at: string }>(
    `select industry, title, text, url, fetched_at from feed_items
     where source in ('reddit','hn','producthunt','googlenews','substack','medium') and fetched_at >= ?
     order by fetched_at desc limit 400`,
    since,
  );
  for (const item of feeds) {
    const handles = extractXHandles(`${item.title || ""} ${item.text || ""} ${item.url || ""}`);
    const recent = Date.now() - Date.parse(item.fetched_at) <= 7 * 86400000;
    for (const handle of handles) {
      const key = `${item.industry || "ai"}:${handle}`;
      const row = mentions.get(key) ?? { count: 0, recent: 0, text: "" };
      row.count += 1;
      if (recent) row.recent += 1;
      row.text = `${row.text} ${item.title || ""}`.slice(0, 400);
      mentions.set(key, row);
    }
  }
  let githubCalls = 0;
  for (const industry of INDUSTRIES) {
    if (githubCalls >= 8) break;
    const query = queriesFor(industry.slug)[0];
    const hn = await cachedGet(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`,
      `hn:${industry.slug}:${query}`,
      "hn.algolia.com",
      400,
      bypass,
    );
    const hits = (hn as { hits?: { title?: string; story_text?: string; url?: string }[] } | null)?.hits ?? [];
    for (const hit of hits) {
      for (const handle of extractXHandles(`${hit.title || ""} ${hit.story_text || ""} ${hit.url || ""}`)) {
        const key = `${industry.slug}:${handle}`;
        const row = mentions.get(key) ?? { count: 0, recent: 0, text: "" };
        row.count += 1;
        row.recent += 1;
        row.text = `${row.text} ${hit.title || ""}`.slice(0, 400);
        mentions.set(key, row);
      }
    }
    const gh = await cachedGet(
      `https://api.github.com/search/users?q=${encodeURIComponent(`${query} followers:>30`)}&per_page=1`,
      `gh:search:${industry.slug}`,
      "api.github.com",
      process.env.GITHUB_TOKEN ? 700 : 3500,
      bypass,
    );
    githubCalls += 1;
    const login = (gh as { items?: { login?: string }[] } | null)?.items?.[0]?.login;
    if (!login || githubCalls >= 8) continue;
    const profile = await cachedGet(
      `https://api.github.com/users/${encodeURIComponent(login)}`,
      `gh:user:${login.toLowerCase()}`,
      "api.github.com",
      process.env.GITHUB_TOKEN ? 700 : 3500,
      bypass,
    );
    githubCalls += 1;
    const twitter = (profile as { twitter_username?: string | null } | null)?.twitter_username;
    if (twitter) {
      const handle = twitter.replace(/^@/, "").toLowerCase();
      const key = `${industry.slug}:${handle}`;
      const row = mentions.get(key) ?? { count: 0, recent: 0, text: "" };
      row.count += 2;
      row.recent += 1;
      row.text = `${row.text} github ${login}`;
      mentions.set(key, row);
    }
  }
  const apiAuthors = new Map<string, { followers: number; engagement: number; text: string; mentions: string[]; reposts: string[] }>();
  let notice = "";
  for (const industry of INDUSTRIES) {
    const query = queriesFor(industry.slug)[0];
    const posts = await searchXPosts(`${query} -is:retweet`, bypass);
    if (!posts.length && !notice) notice = "没有可用的 X 数据接口，账号只从 Reddit、HN、GitHub 和新闻里收集";
    for (const post of posts) {
      if (!post.author) continue;
      const key = `${industry.slug}:${post.author.toLowerCase()}`;
      const row = apiAuthors.get(key) ?? { followers: post.followers ?? 0, engagement: 0, text: "", mentions: [], reposts: [] };
      row.engagement += post.likes + post.reposts + post.replies;
      row.followers = Math.max(row.followers, post.followers ?? 0);
      row.text = `${row.text} ${post.text}`.slice(0, 500);
      row.mentions.push(...post.mentions);
      if (post.repostOf) row.reposts.push(post.repostOf);
      apiAuthors.set(key, row);
    }
  }
  for (const industry of INDUSTRIES) {
    const scored = new Map<string, Candidate>();
    for (const [key, info] of mentions) {
      if (!key.startsWith(`${industry.slug}:`)) continue;
      const handle = key.slice(industry.slug.length + 1);
      const relevance = relevanceScore(info.text, seedsFor(industry.slug));
      scored.set(handle, {
        key: handle,
        relevance,
        reason: `近 30 天在社区或新闻里被提到 ${info.count} 次`,
        score: accountScore({ followers: null, postsPerDay: null, engagementRate: null, relevance: Math.max(relevance, info.count ? 0.35 : 0), mentions: info.recent || info.count }),
      });
    }
    for (const [key, info] of apiAuthors) {
      if (!key.startsWith(`${industry.slug}:`)) continue;
      const handle = key.slice(industry.slug.length + 1);
      const relevance = relevanceScore(info.text, seedsFor(industry.slug));
      const rate = info.followers > 0 ? info.engagement / info.followers : null;
      const previous = scored.get(handle);
      scored.set(handle, {
        key: handle,
        relevance,
        reason: `行业搜索里的高互动作者`,
        score: Math.max(
          previous?.score ?? 0,
          accountScore({ followers: info.followers, postsPerDay: null, engagementRate: rate, relevance, mentions: null }),
        ),
      });
      for (const related of [...info.mentions, ...info.reposts]) {
        if (related.toLowerCase() === handle) continue;
        if (scored.has(related)) continue;
        scored.set(related, {
          key: related,
          relevance: relevance * 0.6,
          reason: `被 @${handle} 提及或转发`,
          score: accountScore({ followers: null, postsPerDay: null, engagementRate: null, relevance: relevance * 0.6, mentions: 2 }),
        });
      }
    }
    candidates += scored.size;
    const ranked = await refineScores(industry.slug, [...scored.values()], seedsFor(industry.slug));
    recordEvents(runId, "x", industry.slug, "candidate", ranked);
    const outcome = applyPool("x", industry.slug, ranked, limit);
    recordEvents(runId, "x", industry.slug, "added", outcome.add);
    recordEvents(runId, "x", industry.slug, "retired", outcome.retire);
    added += outcome.added;
    retired += outcome.retired;
  }
  return { candidates, added, retired, notice };
}

async function refineScores(industry: string, items: Candidate[], seeds: string[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !items.length) return items;
  const batch = [...items].sort((a, b) => b.score - a.score).slice(0, 12);
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  try {
    const res = await fetchText(`${base}/chat/completions`, {
      method: "POST",
      timeoutMs: 20000,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "判断账号或板块和给定行业种子有多相关。只返回 JSON：{\"scores\":[{\"name\":string,\"score\":number}]}。score 从 0 到 1。",
          },
          { role: "user", content: JSON.stringify({ industry, seeds, items: batch.map((item) => ({ name: item.key, reason: item.reason })) }) },
        ],
      }),
    });
    if (!res.ok) return items;
    const content = JSON.parse(res.text).choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return items;
    const parsed = JSON.parse(match[0]) as { scores?: { name?: string; score?: number }[] };
    const scores = new Map((parsed.scores ?? []).filter((row) => row.name && typeof row.score === "number").map((row) => [String(row.name).toLowerCase(), Math.max(0, Math.min(1, row.score as number))]));
    return items.map((item) => {
      const extra = scores.get(item.key.toLowerCase());
      if (extra == null) return item;
      return { ...item, relevance: Math.max(item.relevance, extra), score: Math.round(item.score * 0.55 + extra * 100 * 0.45) };
    });
  } catch {
    return items;
  }
}

function applyPool(platform: "x" | "reddit", industry: string, candidates: Candidate[], limit: number) {
  const table = platform === "x" ? "x_accounts" : "subreddits";
  const column = platform === "x" ? "handle" : "name";
  const rows = all<{ key: string; origin: string; status: string; heat_score: number | null; relevance: number | null; posts_per_day: number | null; stats_at: string | null; discovered_reason: string | null }>(
    `select ${column} as key, origin, status, heat_score, relevance, posts_per_day, stats_at, discovered_reason from ${table} where industry = ?`,
    industry,
  );
  const blocked = rows.filter((row) => row.status === "rejected").map((row) => row.key);
  const now = Date.now();
  const active: PoolItem[] = [];
  const forced: { key: string; reason: string }[] = [];
  for (const row of rows) {
    if (row.status !== "active" && row.status !== "paused") continue;
    const pinned = row.origin === "user";
    const posts = all<{ published_at: string | null }>(
      "select published_at from source_posts where platform = ? and account_key = ? order by published_at desc limit 1",
      platform,
      row.key.toLowerCase(),
    );
    const decision = shouldRetire({
      pinned: pinned || row.status === "paused",
      postsPerDay: row.posts_per_day == null ? null : Number(row.posts_per_day),
      relevance: row.relevance == null ? null : Number(row.relevance),
      lastPostAt: posts[0]?.published_at ?? null,
      now,
    });
    if (decision.retire && row.status === "active") {
      forced.push({ key: row.key, reason: decision.reason });
      continue;
    }
    active.push({
      key: row.key,
      score: Number(row.heat_score ?? 0),
      origin: row.origin,
      status: row.status === "paused" ? "paused" : "active",
      pinned,
      reason: row.discovered_reason || "",
    });
  }
  const result = rebalanceSources(
    active,
    candidates.map((item) => ({ key: item.key, score: item.score, origin: "discovered", status: "active" as const, pinned: false, reason: item.reason })),
    limit,
    blocked,
  );
  for (const item of result.add) {
    const candidate = candidates.find((row) => row.key.toLowerCase() === item.key.toLowerCase());
    const relevance = candidate?.relevance ?? 0;
    const existing = get<{ id: number; origin: string }>(
      `select id, origin from ${table} where industry = ? and lower(${column}) = lower(?)`,
      industry,
      item.key,
    );
    if (existing) {
      if (existing.origin === "user") continue;
      run(
        `update ${table} set status = 'active', origin = 'discovered', discovered_reason = ?, relevance = ?, retired_reason = null where id = ?`,
        item.reason,
        relevance,
        existing.id,
      );
    } else if (platform === "x") {
      run(
        "insert into x_accounts (industry, handle, status, origin, discovered_reason, relevance) values (?, ?, 'active', 'discovered', ?, ?)",
        industry,
        item.key.toLowerCase(),
        item.reason,
        relevance,
      );
    } else {
      run(
        "insert into subreddits (industry, name, status, origin, discovered_reason, relevance) values (?, ?, 'active', 'discovered', ?, ?)",
        industry,
        item.key,
        item.reason,
        relevance,
      );
    }
  }
  for (const item of [...forced, ...result.retire]) {
    run(`update ${table} set status = 'retired', retired_reason = ? where industry = ? and lower(${column}) = lower(?) and origin != 'user'`, item.reason, industry, item.key);
  }
  const retire = [...forced, ...result.retire];
  return { add: result.add, retire, added: result.add.length, retired: retire.length };
}

function recordEvents(runId: number, platform: string, industry: string, action: string, items: { key: string; reason: string; score?: number }[]) {
  if (!runId || !items.length) return;
  const now = new Date().toISOString();
  for (const item of items) {
    run(
      "insert into discovery_events (run_id, platform, industry, account_key, action, reason, score, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      runId,
      platform,
      industry,
      item.key,
      action,
      item.reason,
      item.score ?? null,
      now,
    );
  }
}
