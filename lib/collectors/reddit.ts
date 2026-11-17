import { hoursSince, withinDays } from "../extract";
import { run } from "../db";
import { fetchJson, fetchText } from "../http";
import { classifyDiscussion } from "../sources/metrics";
import { recomputeHeat, saveCommunityPosts } from "../sources/stats";
import { readFeed } from "../rss";
import { hitsFromDoc, result, type CollectContext, type CollectorResult, type FeedItem, type Hit, type Suggestion } from "./types";

type RedditPost = {
  id?: string;
  title?: string;
  selftext?: string;
  body?: string;
  permalink?: string;
  link_permalink?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  subreddit?: string;
  crosspost_parent_list?: { subreddit?: string }[];
};

const UA = "web:seo-keyword-radar:1.0 (by /u/seo-radar)";

function pickRoundRobin<T extends { industry: string; lastFetched?: string | null }>(rows: T[], limit: number) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.industry) ?? [];
    list.push(row);
    groups.set(row.industry, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.lastFetched ?? "").localeCompare(b.lastFetched ?? ""));
  }
  const picked: T[] = [];
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const list of groups.values()) {
      const next = list.shift();
      if (!next) continue;
      picked.push(next);
      progressed = true;
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetchText("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    body: "grant_type=client_credentials",
    timeoutMs: 12000,
    hostKey: "www.reddit.com",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
  });
  if (!res.ok) return null;
  try {
    const json = JSON.parse(res.text) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

function fromListing(payload: unknown): RedditPost[] {
  const data = payload as { data?: { children?: { data?: RedditPost }[] } };
  return (data.data?.children ?? []).map((child) => child.data).filter(Boolean) as RedditPost[];
}

export async function collectReddit(ctx: CollectContext): Promise<CollectorResult> {
  const picked = pickRoundRobin(
    ctx.subreddits.map((sub) => ({ ...sub, lastFetched: sub.lastFetched })),
    5,
  );
  if (!picked.length) return result("reddit", "error", "没有启用的 subreddit");
  const token = await redditToken();
  const hits: Hit[] = [];
  const feed: FeedItem[] = [];
  const suggestions: Suggestion[] = [];
  const authorCounts = new Map<string, { industry: string; count: number }>();
  const suggestedSubs = new Set<string>();
  let failures = 0;
  let lastError = "";
  const now = new Date().toISOString();

  for (const sub of picked) {
    try {
      let posts = token ? await loadJson(token, sub.name, "new") : await loadPublic(sub.name, "new");
      if (!posts.length) posts = await loadRss(sub.name);
      const hot = token ? await loadJson(token, sub.name, "hot") : await loadPublic(sub.name, "hot");
      const comments = token ? await loadJson(token, sub.name, "comments") : await loadPublic(sub.name, "comments");
      const about = await loadAbout(sub.name, token);
      if (about) {
        run("update subreddits set subscribers = ?, active_users = ? where id = ?", about.subscribers, about.active, sub.id);
      }
      const docs = [...posts, ...hot, ...comments].slice(0, 24);
      saveCommunityPosts(
        "reddit",
        sub.name,
        docs.slice(0, 16).map((post) => ({
          id: post.id || post.permalink || post.title || "",
          title: post.title || "",
          text: post.selftext || post.body || "",
          url: (post.permalink || "").startsWith("http") ? post.permalink : post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
          engagement: (post.score ?? 0) + (post.num_comments ?? 0),
          score: post.score,
          comments: post.num_comments,
          publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
          discussion: classifyDiscussion(`${post.title || ""} ${post.selftext || post.body || ""}`),
        })),
      );
      recomputeHeat("reddit", sub.name, about?.subscribers ?? null, about?.active ?? null);
      for (const post of docs) {
        const published = post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined;
        if (published && !withinDays(published, 14)) continue;
        const title = post.title || "";
        const body = post.selftext || post.body || "";
        const path = post.permalink || post.link_permalink || "";
        const url = path.startsWith("http") ? path : path ? `https://www.reddit.com${path}` : undefined;
        const hours = hoursSince(published);
        const velocity = hours && (post.score || post.num_comments) ? ((post.score ?? 0) + (post.num_comments ?? 0)) / hours : undefined;
        const author = (post.author || "").replace(/^\/u\//, "");
        const docHits = hitsFromDoc({
          title,
          body,
          url,
          author,
          publishedAt: published,
          engagement: (post.score ?? 0) + (post.num_comments ?? 0),
          industry: sub.industry,
          channel: sub.name,
        });
        hits.push(...docHits);
        if (url && (title || body)) {
          feed.push({
            source: "reddit",
            industry: sub.industry,
            externalId: post.id || url,
            author,
            title: title || body.slice(0, 140),
            text: body.slice(0, 500),
            url,
            engagement: (post.score ?? 0) + (post.num_comments ?? 0),
            velocity,
            intent: docHits[0]?.intent,
            publishedAt: published,
          });
        }
        if (author && author !== "[deleted]" && author !== "AutoModerator") {
          const key = `${sub.industry}:${author.toLowerCase()}`;
          const prev = authorCounts.get(key) ?? { industry: sub.industry, count: 0 };
          prev.count += 1;
          authorCounts.set(key, prev);
        }
        const blob = `${title} ${body}`;
        for (const match of blob.matchAll(/\/r\/([A-Za-z0-9_]{3,21})/g)) {
          const name = match[1];
          if (name.toLowerCase() === sub.name.toLowerCase()) continue;
          const key = `${sub.industry}:${name.toLowerCase()}`;
          if (suggestedSubs.has(key)) continue;
          suggestedSubs.add(key);
          suggestions.push({
            kind: "subreddit",
            industry: sub.industry,
            value: name,
            reason: `在 r/${sub.name} 的新帖里被提到`,
          });
        }
        for (const cross of post.crosspost_parent_list ?? []) {
          if (!cross.subreddit || cross.subreddit.toLowerCase() === sub.name.toLowerCase()) continue;
          suggestions.push({
            kind: "subreddit",
            industry: sub.industry,
            value: cross.subreddit,
            reason: `从 r/${sub.name} 转帖而来`,
          });
        }
      }
      run("update subreddits set last_fetched_at=? where id=?", now, sub.id);
    } catch (error) {
      failures += 1;
      lastError = error instanceof Error ? error.message : "失败";
    }
  }

  for (const [key, info] of authorCounts) {
    if (info.count < 2) continue;
    const username = key.split(":")[1];
    if (!username) continue;
    suggestions.push({
      kind: "reddit_user",
      industry: info.industry,
      value: username,
      reason: `本轮在 r/ 监控里出现 ${info.count} 次`,
    });
  }

  if (token) {
    for (const user of ctx.redditUsers.slice(0, 4)) {
      const res = await fetchJson(`https://oauth.reddit.com/user/${encodeURIComponent(user.username)}/submitted?limit=8`, {
        intervalMs: 1100,
        hostKey: "oauth.reddit.com",
        headers: { authorization: `Bearer ${token}`, "user-agent": UA },
      });
      for (const post of fromListing(res.data)) {
        hits.push(
          ...hitsFromDoc({
            title: post.title,
            body: post.selftext,
            url: post.permalink ? `https://www.reddit.com${post.permalink}` : undefined,
            author: user.username,
            industry: user.industry,
            publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : undefined,
            engagement: (post.score ?? 0) + (post.num_comments ?? 0),
          }),
        );
      }
    }
  }

  if (!hits.length && !feed.length) {
    return result("reddit", "error", `${token ? "官方 API" : "公开 RSS"} 没有返回帖子${lastError ? `：${lastError}` : ""}，失败 ${failures} 个`);
  }
  const mode = token ? "官方 API" : "公开 RSS（无分数，热度按新帖时间估计）";
  return result("reddit", "ok", `${mode}，本轮轮转 ${picked.length} 个社区，失败 ${failures} 个`, {
    hits: hits.slice(0, 120),
    feed: feed.slice(0, 80),
    suggestions: suggestions.slice(0, 30),
  });
}

async function loadPublic(sub: string, kind: "new" | "hot" | "comments") {
  const res = await fetchJson(`https://www.reddit.com/r/${encodeURIComponent(sub)}/${kind}.json?limit=12&raw_json=1`, {
    intervalMs: 2200,
    timeoutMs: 12000,
    hostKey: "www.reddit.com",
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!res.ok) return [];
  return fromListing(res.data);
}

async function loadAbout(sub: string, token: string | null) {
  const url = token
    ? `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/about?raw_json=1`
    : `https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json?raw_json=1`;
  const res = await fetchJson<{ data?: { subscribers?: number; accounts_active?: number; active_user_count?: number } }>(url, {
    intervalMs: token ? 1100 : 2200,
    timeoutMs: 12000,
    hostKey: token ? "oauth.reddit.com" : "www.reddit.com",
    headers: token ? { authorization: `Bearer ${token}`, "user-agent": UA } : { "user-agent": UA, accept: "application/json" },
  });
  const data = res.data?.data;
  if (!res.ok || !data) return null;
  return { subscribers: data.subscribers ?? null, active: data.accounts_active ?? data.active_user_count ?? null };
}

async function loadJson(token: string, sub: string, kind: "new" | "hot" | "comments") {
  const res = await fetchJson(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${kind}?limit=15&raw_json=1`, {
    intervalMs: 1100,
    hostKey: "oauth.reddit.com",
    headers: { authorization: `Bearer ${token}`, "user-agent": UA },
  });
  if (!res.ok) throw new Error(String(res.status));
  return fromListing(res.data);
}

async function loadRss(sub: string): Promise<RedditPost[]> {
  let last = "RSS 失败";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await readFeed(`https://www.reddit.com/r/${encodeURIComponent(sub)}/new.rss?limit=12`, {
      intervalMs: 2800,
      hostKey: "www.reddit.com",
    }).catch(async (error: unknown) => {
      last = error instanceof Error ? error.message : "RSS 失败";
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return null;
    });
    if (res) {
      return res.map((entry) => ({
        id: entry.link || entry.title,
        title: entry.title,
        selftext: entry.content,
        permalink: entry.link,
        author: entry.author?.replace(/^\/u\//, "").trim(),
        created_utc: entry.date ? Date.parse(entry.date) / 1000 : undefined,
        subreddit: sub,
      }));
    }
  }
  throw new Error(last);
}
