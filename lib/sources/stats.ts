import { all, run } from "../db";
import { phrasesFromText } from "../extract";
import { classifyDiscussion, engagementTrend, heatScore, postsPerDay, type DiscussionType } from "./metrics";

export type StoredPost = {
  id: string;
  title?: string;
  text: string;
  url?: string;
  engagement: number;
  score?: number;
  comments?: number;
  publishedAt?: string | null;
  discussion?: DiscussionType;
};

export function saveCommunityPosts(platform: string, key: string, posts: StoredPost[]) {
  const now = new Date().toISOString();
  for (const post of posts) {
    if (!post.id) continue;
    const discussion = post.discussion || classifyDiscussion(`${post.title ?? ""} ${post.text}`);
    run(
      `insert into source_posts (platform, account_key, external_id, title, text, url, engagement, score, comments, discussion_type, published_at, collected_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(platform, account_key, external_id) do update set
         engagement=excluded.engagement, score=excluded.score, comments=excluded.comments, discussion_type=excluded.discussion_type, title=excluded.title, text=excluded.text`,
      platform,
      key.toLowerCase(),
      post.id,
      post.title ?? null,
      post.text.slice(0, 1000),
      post.url ?? null,
      post.engagement,
      post.score ?? null,
      post.comments ?? null,
      discussion,
      post.publishedAt ?? null,
      now,
    );
  }
}

export function recomputeHeat(platform: string, key: string, audience: number | null, activeUsers: number | null = null) {
  const rows = all<{ engagement: number | null; score: number | null; published_at: string | null }>(
    "select engagement, score, published_at from source_posts where platform = ? and account_key = ?",
    platform,
    key.toLowerCase(),
  );
  const now = Date.now();
  const stamp = (iso: string | null) => {
    const time = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(time) ? time : null;
  };
  const recent = rows.filter((row) => {
    const time = stamp(row.published_at);
    return time != null && now - time <= 7 * 86400000;
  });
  const prior = rows.filter((row) => {
    const time = stamp(row.published_at);
    return time != null && now - time > 7 * 86400000 && now - time <= 14 * 86400000;
  });
  const perDay = postsPerDay(rows.map((row) => stamp(row.published_at)).filter((time): time is number => time != null), now);
  const avg = (list: typeof rows) => (list.length ? list.reduce((sum, row) => sum + Number(row.engagement ?? row.score ?? 0), 0) / list.length : 0);
  const trend = engagementTrend(
    recent.map((row) => Number(row.engagement ?? row.score ?? 0)),
    prior.map((row) => Number(row.engagement ?? row.score ?? 0)),
  );
  const heat = heatScore({ audience, perDay, avgEngagement: recent.length ? avg(recent) : avg(rows), trend });
  const updated = new Date().toISOString();
  if (platform === "x") {
    run(
      `update x_accounts set followers = coalesce(?, followers), heat_score = ?, posts_per_day = ?, avg_engagement = ?, trend = ?, stats_at = ? where lower(handle) = lower(?)`,
      audience,
      heat,
      perDay,
      recent.length ? avg(recent) : avg(rows),
      trend,
      updated,
      key,
    );
  } else {
    run(
      `update subreddits set subscribers = coalesce(?, subscribers), active_users = coalesce(?, active_users), heat_score = ?, posts_per_day = ?, avg_engagement = ?, trend = ?, stats_at = ? where lower(name) = lower(?)`,
      audience,
      activeUsers,
      heat,
      perDay,
      recent.length ? avg(recent) : avg(rows),
      trend,
      updated,
      key,
    );
  }
  return { heat, perDay, trend };
}

export function topTopics(texts: string[], limit = 5) {
  const counts = new Map<string, { display: string; count: number }>();
  for (const text of texts) {
    for (const phrase of phrasesFromText({ body: text, social: true })) {
      const key = phrase.term.toLowerCase();
      const row = counts.get(key) ?? { display: phrase.display, count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((row) => row.display);
}

export function discussionBreakdown(types: string[]) {
  const counts = { ask: 0, pain: 0, compare: 0, recommend: 0, other: 0 };
  for (const type of types) {
    if (type === "ask" || type === "pain" || type === "compare" || type === "recommend") counts[type] += 1;
    else counts.other += 1;
  }
  return counts;
}
