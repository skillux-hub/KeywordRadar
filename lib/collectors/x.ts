import { run } from "../db";
import { withinDays } from "../extract";
import { fetchJson } from "../http";
import { hitsFromDoc, result, type CollectContext, type CollectorResult, type FeedItem, type Hit, type Suggestion } from "./types";

type Tweet = {
  id: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; quote_count?: number };
  entities?: { mentions?: { username?: string }[] };
};

function engagement(tweet: Tweet) {
  const m = tweet.public_metrics;
  return (m?.like_count ?? 0) + (m?.retweet_count ?? 0) + (m?.reply_count ?? 0) + (m?.quote_count ?? 0);
}

export async function collectX(ctx: CollectContext): Promise<CollectorResult> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return result("x", "disabled", "未配置 X_BEARER_TOKEN。X 大V监控已暂停，不会影响其他来源。这是只读监控，不会关注任何账号。");
  }
  const headers = { authorization: `Bearer ${token}` };
  const accounts = [...ctx.xAccounts].sort((a, b) => (a.lastFetched ?? "").localeCompare(b.lastFetched ?? "")).slice(0, 8);
  if (!accounts.length) return result("x", "error", "没有启用的 X 账号");
  const hits: Hit[] = [];
  const feed: FeedItem[] = [];
  const mentionBy = new Map<string, { industries: Set<string>; authors: Set<string>; engagement: number }>();
  let failures = 0;
  let replyNote = "";
  const now = new Date().toISOString();

  for (const account of accounts) {
    let userId = account.userId;
    if (!userId) {
      const user = await fetchJson<{ data?: { id?: string; name?: string } }>(
        `https://api.x.com/2/users/by/username/${encodeURIComponent(account.handle)}`,
        { headers, intervalMs: 400, timeoutMs: 12000, hostKey: "api.x.com" },
      );
      if (user.status === 429) {
        return result("x", "error", `读到 ${feed.length} 条后触发速率限制，已停止本轮`, { hits, feed, suggestions: suggestionsFrom(mentionBy) });
      }
      userId = user.data?.data?.id ?? null;
      if (!userId) {
        failures += 1;
        continue;
      }
      run("update x_accounts set user_id=?, display_name=coalesce(display_name, ?) where id=?", userId, user.data?.data?.name ?? null, account.id);
    }
    const timeline = await fetchJson<{ data?: Tweet[] }>(
      `https://api.x.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics,entities&exclude=retweets`,
      { headers, intervalMs: 500, timeoutMs: 12000, hostKey: "api.x.com" },
    );
    if (timeline.status === 429) {
      return result("x", "error", `速率限制。已保存 ${feed.length} 条时间线`, { hits, feed, suggestions: suggestionsFrom(mentionBy) });
    }
    if (!timeline.ok) {
      failures += 1;
      continue;
    }
    for (const tweet of timeline.data?.data ?? []) {
      if (!tweet.text || !withinDays(tweet.created_at, 7)) continue;
      const url = `https://x.com/${account.handle}/status/${tweet.id}`;
      const score = engagement(tweet);
      hits.push(
        ...hitsFromDoc({
          title: tweet.text.split("\n")[0],
          body: tweet.text,
          url,
          author: account.handle,
          publishedAt: tweet.created_at,
          engagement: score,
          industry: account.industry,
        }),
      );
      feed.push({
        source: "x",
        industry: account.industry,
        externalId: tweet.id,
        author: account.handle,
        title: tweet.text.slice(0, 180),
        text: tweet.text,
        url,
        engagement: score,
        publishedAt: tweet.created_at,
      });
      for (const mention of tweet.entities?.mentions ?? []) {
        const handle = mention.username?.replace(/^@/, "").toLowerCase();
        if (!handle || handle === account.handle.toLowerCase()) continue;
        const row = mentionBy.get(handle) ?? { industries: new Set<string>(), authors: new Set<string>(), engagement: 0 };
        row.industries.add(account.industry);
        row.authors.add(account.handle);
        row.engagement += score;
        mentionBy.set(handle, row);
      }
    }
    run("update x_accounts set last_fetched_at=? where id=?", now, account.id);
  }

  if (!replyNote && accounts[0]) {
    const reply = await fetchJson<{ data?: Tweet[]; includes?: { users?: { id: string; username: string }[] } }>(
      `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(`to:${accounts[0].handle} -from:${accounts[0].handle}`)}&max_results=10&tweet.fields=created_at,public_metrics&expansions=author_id&user.fields=username`,
      { headers, intervalMs: 600, timeoutMs: 12000, hostKey: "api.x.com" },
    );
    if (reply.status === 403 || reply.status === 402) {
      replyNote = "高互动回复搜索需要更高的 X API 权限，本轮只用了时间线。";
    } else if (reply.ok) {
      const users = new Map((reply.data?.includes?.users ?? []).map((user) => [user.id, user.username]));
      for (const tweet of reply.data?.data ?? []) {
        const author = users.get(tweet.author_id ?? "") ?? "unknown";
        const score = engagement(tweet);
        if (score < 20) continue;
        hits.push(
          ...hitsFromDoc({
            title: tweet.text,
            body: tweet.text,
            url: `https://x.com/${author}/status/${tweet.id}`,
            author,
            publishedAt: tweet.created_at,
            engagement: score,
            industry: accounts[0].industry,
          }),
        );
        const handle = author.toLowerCase();
        const row = mentionBy.get(handle) ?? { industries: new Set<string>(), authors: new Set<string>(), engagement: 0 };
        row.industries.add(accounts[0].industry);
        row.authors.add(accounts[0].handle);
        row.engagement += score;
        mentionBy.set(handle, row);
      }
      replyNote = "已抽样读取一个账号的高互动回复。";
    }
  }

  if (!feed.length && failures) return result("x", "error", "时间线请求失败。确认 token 是否有用户时间线权限。");
  return result("x", "ok", `只读拉取 ${accounts.length} 个账号、${feed.length} 条帖子。${replyNote}不会关注任何账号。`, {
    hits: hits.slice(0, 100),
    feed,
    suggestions: suggestionsFrom(mentionBy),
  });
}

function suggestionsFrom(mentionBy: Map<string, { industries: Set<string>; authors: Set<string>; engagement: number }>): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const [handle, info] of mentionBy) {
    if (info.authors.size < 2 && info.engagement < 150) continue;
    const industry = [...info.industries][0];
    if (!industry) continue;
    suggestions.push({
      kind: "x_account",
      industry,
      value: handle,
      reason:
        info.authors.size >= 2
          ? `被 ${[...info.authors].slice(0, 3).join("、")} 提及`
          : `在高互动帖子里被提到（互动约 ${Math.round(info.engagement)}）`,
    });
  }
  return suggestions.slice(0, 20);
}
