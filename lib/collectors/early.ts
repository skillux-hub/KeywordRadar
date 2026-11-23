import { get, run } from "../db";
import { classifyIndustries, withinDays } from "../extract";
import { githubCreatedSearch, showHnParts } from "./registry-parse";
import { classifyBreakout, repoSearchVariants } from "../signals/breakout";
import { fetchJson, fetchText } from "../http";
import { decodeHtml } from "../xml";
import { readFeed } from "../rss";
import { hitsFromDoc, result, type CollectContext, type CollectorResult, type FeedItem, type Hit } from "./types";

function glOf(region: string) {
  if (region === "GB") return "GB";
  if (region === "CA") return "CA";
  if (region === "AU") return "AU";
  return "US";
}

function takeHits(docs: Parameters<typeof hitsFromDoc>[0][], limit = 80) {
  const hits: Hit[] = [];
  for (const doc of docs) {
    hits.push(...hitsFromDoc(doc));
    if (hits.length >= limit) break;
  }
  return hits.slice(0, limit);
}

export async function collectHn(ctx: CollectContext): Promise<CollectorResult> {
  type Row = {
    title?: string;
    url?: string;
    author?: string;
    created_at?: string;
    points?: number;
    num_comments?: number;
    objectID?: string;
    story_text?: string;
  };
  const queries: { q: string | null; seedId: number | null; industry: string | null }[] = ctx.probe === "showhn" ? [] : [
    { q: null, seedId: null, industry: null },
    ...ctx.seeds.slice(0, 8).map((seed) => ({ q: seed.topic, seedId: seed.id, industry: seed.industry })),
  ];
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  const feed: FeedItem[] = [];
  let errors = 0;
  for (const query of queries) {
    const url = query.q
      ? `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query.q)}&tags=story&hitsPerPage=12`
      : "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=25";
    const res = await fetchJson<{ hits?: Row[] }>(url, { intervalMs: 200, timeoutMs: 12000, hostKey: "hn.algolia.com" });
    if (!res.ok || !res.data?.hits) {
      errors += 1;
      continue;
    }
    for (const hit of res.data.hits) {
      if (!hit.title || !withinDays(hit.created_at, 14)) continue;
      const industry = classifyIndustries(hit.title)[0] ?? null;
      const link = hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : undefined);
      docs.push({
        title: hit.title,
        body: hit.story_text,
        url: link,
        author: hit.author,
        publishedAt: hit.created_at,
        engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
        industry,
        seedId: query.seedId,
      });
      if (hit.objectID) {
        feed.push({
          source: "hn",
          industry,
          externalId: hit.objectID,
          author: hit.author,
          title: hit.title,
          text: hit.story_text,
          url: link,
          engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
          publishedAt: hit.created_at,
        });
      }
    }
  }
  const show = await fetchJson<{ hits?: Row[] }>(`https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=${ctx.probe === "showhn" ? 15 : 15}`, {
    intervalMs: 200,
    timeoutMs: 12000,
    hostKey: "hn.algolia.com",
  });
  for (const hit of show.data?.hits ?? []) {
    if (!hit.title || !hit.created_at) continue;
    const parts = showHnParts(hit.title);
    if (!parts.name) continue;
    docs.push({
      entityOnly: true,
      entityName: parts.name,
      context: parts.context || hit.story_text || "",
      title: parts.name,
      url: hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : undefined),
      author: hit.author,
      publishedAt: hit.created_at,
      bornKind: "product_launch",
      bornAt: hit.created_at,
      engagement: (hit.points ?? 0) + (hit.num_comments ?? 0),
    });
  }
  if (!docs.length && errors && !show.ok) return result("hn", "error", "Algolia 没有返回故事");
  return result("hn", "ok", `读取 ${docs.length} 条近期故事，Show HN 用 created_at 而不是 updated_at`, { hits: takeHits(docs), feed: feed.slice(0, 40) });
}

export async function collectProductHunt(): Promise<CollectorResult> {
  const token = process.env.PRODUCTHUNT_TOKEN;
  type Post = { id?: string; name?: string; tagline?: string; url?: string; votesCount?: number; createdAt?: string };
  const posts: Post[] = [];
  let via = "RSS";
  if (token) {
    const res = await fetchText("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      timeoutMs: 12000,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        query: "query { posts(first: 20, order: NEWEST) { edges { node { id name tagline url votesCount createdAt } } } }",
      }),
    });
    if (res.ok) {
      try {
        const json = JSON.parse(res.text) as { data?: { posts?: { edges?: { node: Post }[] } } };
        for (const edge of json.data?.posts?.edges ?? []) posts.push(edge.node);
        if (posts.length) via = "官方 GraphQL";
      } catch {
        /* fall through */
      }
    }
  }
  if (!posts.length) {
    try {
      const entries = await readFeed("https://www.producthunt.com/feed", { intervalMs: 400, hostKey: "www.producthunt.com" });
      for (const entry of entries) {
        posts.push({ name: entry.title, tagline: entry.content, url: entry.link, createdAt: entry.date, id: entry.link || entry.title });
      }
    } catch (error) {
      return result("producthunt", "error", error instanceof Error ? error.message : "RSS 失败");
    }
  }
  const docs = posts
    .filter((post) => post.name && withinDays(post.createdAt, 21))
    .map((post) => ({
      title: post.name,
      body: post.tagline,
      productName: post.name,
      entityName: post.name,
      bornKind: "product_launch" as const,
      bornAt: post.createdAt,
      url: post.url,
      publishedAt: post.createdAt,
      engagement: post.votesCount,
      entityOnly: true,
      context: post.tagline || "",
      industry: null,
    }));
  return result("producthunt", "ok", `通过${via}读取 ${docs.length} 个新品`, { hits: takeHits(docs) });
}

export async function collectGithub(ctx: CollectContext = { seeds: [], xAccounts: [], subreddits: [], redditUsers: [], sites: [], newsletters: [], youtube: [], medium: [] }): Promise<CollectorResult> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "SEOKeywordRadar/1.0",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repos: { name: string; desc: string; stars: number; url: string; createdAt: string | null }[] = [];
  const page = { ok: false, status: 0 };
  const search = await fetchJson<{ items?: { full_name: string; description: string | null; stargazers_count: number; html_url: string; created_at?: string }[]; message?: string }>(
    githubCreatedSearch(),
    { headers, intervalMs: 700, timeoutMs: 12000, hostKey: "api.github.com" },
  );
  for (const item of search.data?.items ?? []) {
    if (!classifyIndustries(item.description || "").some((industry) => industry === "ai" || industry === "devtools")) continue;
    if (repos.some((repo) => repo.name.toLowerCase() === item.full_name.toLowerCase())) continue;
    repos.push({
      name: item.full_name,
      desc: item.description ?? "",
      stars: item.stargazers_count,
      url: item.html_url,
      createdAt: item.created_at ?? null,
    });
  }
  let breakouts = 0;
  const leadDocs: Parameters<typeof hitsFromDoc>[0][] = [];
  try {
    let lookups = 0;
    for (const repo of repos) {
      if ((!repo.createdAt || repo.stars <= 0) && lookups < 6) {
        lookups += 1;
        const info = await fetchJson<{ stargazers_count?: number; created_at?: string }>(`https://api.github.com/repos/${repo.name}`, {
          headers,
          intervalMs: 700,
          timeoutMs: 8000,
          hostKey: "api.github.com",
        });
        if (info.data) {
          repo.stars = info.data.stargazers_count ?? repo.stars;
          repo.createdAt = info.data.created_at ?? repo.createdAt;
        }
      }
      if (repo.stars <= 0 || ctx.dryRun) continue;
      const previous = get<{ stars: number }>(
        "select stars from repo_snapshots where full_name = ? order by collected_at desc limit 1",
        repo.name,
      );
      const decision = classifyBreakout({ createdAt: repo.createdAt, stars: repo.stars, previousStars: previous ? Number(previous.stars) : null });
      const now = new Date().toISOString();
      run("insert into repo_snapshots (full_name, stars, created_at, collected_at) values (?, ?, ?, ?)", repo.name, repo.stars, repo.createdAt, now);
      const already = get("select full_name from repo_breakouts where full_name = ?", repo.name);
      if (!decision.breakout || already) continue;
      run("insert into repo_breakouts (full_name, first_breakout_at, stars, reason) values (?, ?, ?, ?)", repo.name, now, repo.stars, decision.reason);
      breakouts += 1;
      for (const variant of repoSearchVariants(repo.name)) {
        leadDocs.push({
          title: variant,
          productName: variant,
          repoName: repo.name,
          url: repo.url,
          engagement: repo.stars,
          industry: classifyIndustries(`${repo.name} ${variant}`)[0] ?? null,
        });
      }
    }
  } catch {
    /* 星标快照失败时仍返回这一轮仓库 */
  }
  if (!repos.length) return result("github", "error", search.ok ? "创建时间接口没有返回描述能归类的仓库" : `GitHub 创建时间接口 HTTP ${search.status || page.status}`);
  const docs = repos.slice(0, ctx.maxItems ?? 30).map((repo) => ({
    title: repo.desc || repo.name,
    body: repo.desc,
    repoName: repo.name,
    entityName: repo.name.split("/").pop() || repo.name,
    bornKind: repo.createdAt ? ("repo_created" as const) : undefined,
    bornAt: repo.createdAt || undefined,
    url: repo.url,
    engagement: repo.stars,
    entityOnly: true,
    context: repo.desc,
    industry: null,
  }));
  return result("github", "ok", `按创建时间取到 ${docs.length} 个描述匹配的仓库，首次爆发 ${breakouts} 个。没有 GITHUB_TOKEN 时走公开额度。`, { hits: takeHits([...leadDocs, ...docs], 100) });
}

export async function collectBluesky(ctx: CollectContext): Promise<CollectorResult> {
  type Post = {
    uri: string;
    author?: { handle?: string; displayName?: string };
    record?: { text?: string; createdAt?: string };
    likeCount?: number;
    replyCount?: number;
    repostCount?: number;
  };
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  let errors = 0;
  const seeds = ctx.seeds.slice(0, 8);
  for (const seed of seeds) {
    const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(seed.topic)}&sort=latest&limit=20`;
    const res = await fetchJson<{ posts?: Post[] }>(url, { intervalMs: 450, timeoutMs: 12000, hostKey: "api.bsky.app" });
    if (!res.ok || !res.data?.posts) {
      errors += 1;
      continue;
    }
    for (const post of res.data.posts) {
      const text = post.record?.text ?? "";
      if (!text || !withinDays(post.record?.createdAt, 10)) continue;
      const handle = post.author?.handle;
      const rkey = post.uri.split("/").pop();
      const link = handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : undefined;
      docs.push({
        title: text.split("\n")[0]?.slice(0, 180),
        body: text,
        url: link,
        author: handle,
        publishedAt: post.record?.createdAt,
        engagement: (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0),
        industry: seed.industry,
        seedId: seed.id,
        social: true,
      });
    }
  }
  if (!docs.length && errors === seeds.length) return result("bluesky", "error", "Bluesky 搜索没有返回帖子");
  return result("bluesky", "ok", `按种子词读到 ${docs.length} 条帖子`, { hits: takeHits(docs) });
}

export async function collectStackExchange(): Promise<CollectorResult> {
  const sites: { site: string; industry: string | null }[] = [
    { site: "stackoverflow", industry: null },
    { site: "softwarerecs", industry: "saas" },
    { site: "webapps", industry: "saas" },
    { site: "money", industry: "finance" },
    { site: "fitness", industry: "health" },
    { site: "gaming", industry: "gaming" },
  ];
  const key = process.env.STACKEXCHANGE_KEY;
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  let errors = 0;
  for (const site of sites) {
    const url = `https://api.stackexchange.com/2.3/questions?order=desc&sort=creation&site=${site.site}&pagesize=12${key ? `&key=${encodeURIComponent(key)}` : ""}`;
    const res = await fetchJson<{ items?: { title?: string; link?: string; tags?: string[]; creation_date?: number; score?: number; answer_count?: number }[]; error_message?: string }>(
      url,
      { intervalMs: 400, timeoutMs: 12000, hostKey: "api.stackexchange.com" },
    );
    if (!res.ok || !res.data?.items) {
      errors += 1;
      continue;
    }
    for (const item of res.data.items) {
      if (!item.title) continue;
      const published = item.creation_date ? new Date(item.creation_date * 1000).toISOString() : undefined;
      if (!withinDays(published, 14)) continue;
      const blob = `${item.title} ${(item.tags ?? []).join(" ")}`;
      docs.push({
        title: decodeHtml(item.title),
        body: (item.tags ?? []).join(" "),
        url: item.link,
        publishedAt: published,
        engagement: (item.score ?? 0) + (item.answer_count ?? 0),
        industry: site.industry ?? classifyIndustries(blob)[0] ?? null,
      });
    }
  }
  if (!docs.length && errors) return result("stackexchange", "error", "问题接口没有返回数据");
  return result("stackexchange", "ok", `新问题 ${docs.length} 条`, { hits: takeHits(docs) });
}

export async function collectYoutube(ctx: CollectContext): Promise<CollectorResult> {
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  const failures: string[] = [];
  for (const channel of ctx.youtube) {
    try {
      const entries = await readFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`, {
        intervalMs: 300,
        hostKey: "www.youtube.com",
      });
      for (const entry of entries.slice(0, 6)) {
        if (!withinDays(entry.date, 21)) continue;
        docs.push({
          title: entry.title,
          body: entry.content,
          url: entry.link,
          author: channel.name ?? entry.author,
          publishedAt: entry.date,
          industry: channel.industry,
        });
      }
    } catch {
      failures.push(channel.name || channel.channelId);
    }
  }
  const key = process.env.YOUTUBE_API_KEY;
  let apiNote = "未配置 YOUTUBE_API_KEY，标签和评论未拉";
  if (key) {
    let apiOk = 0;
    for (const seed of ctx.seeds.slice(0, 4)) {
      const after = new Date(Date.now() - 7 * 86400000).toISOString();
      const search = await fetchJson<{ items?: { id?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string } }[] }>(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=5&publishedAfter=${encodeURIComponent(after)}&q=${encodeURIComponent(seed.topic)}&relevanceLanguage=en&regionCode=${glOf(seed.region)}&key=${encodeURIComponent(key)}`,
        { intervalMs: 300, timeoutMs: 12000, hostKey: "www.googleapis.com" },
      );
      const ids = (search.data?.items ?? []).map((item) => item.id?.videoId).filter(Boolean) as string[];
      for (const item of search.data?.items ?? []) {
        const videoId = item.id?.videoId;
        if (!videoId || !item.snippet?.title) continue;
        docs.push({
          title: item.snippet.title,
          body: item.snippet.description,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          author: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          industry: seed.industry,
          seedId: seed.id,
        });
      }
      if (ids.length) {
        const videos = await fetchJson<{ items?: { snippet?: { tags?: string[]; title?: string } }[] }>(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids.slice(0, 5).join(",")}&key=${encodeURIComponent(key)}`,
          { intervalMs: 250, hostKey: "www.googleapis.com" },
        );
        for (const video of videos.data?.items ?? []) {
          const tags = video.snippet?.tags?.slice(0, 6).join(" ") ?? "";
          if (!tags) continue;
          docs.push({
            title: tags,
            body: video.snippet?.title,
            industry: seed.industry,
            seedId: seed.id,
          });
        }
        apiOk += 1;
      }
    }
    apiNote = apiOk ? `Data API 补了 ${apiOk} 个种子的新视频和标签` : "Data API 没有返回搜索结果";
  }
  if (!docs.length) return result("youtube", "error", `频道 RSS 失败：${failures.join("、") || "无频道"}`);
  const message = `频道新视频 ${docs.length} 条。${apiNote}${failures.length ? `。失败频道：${failures.join("、")}` : ""}`;
  return result("youtube", "ok", message, { hits: takeHits(docs, 90) });
}

export async function collectNewsletters(ctx: CollectContext): Promise<CollectorResult> {
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  const failures: string[] = [];
  for (const feed of ctx.newsletters) {
    try {
      const entries = await readFeed(feed.url, { intervalMs: 400 });
      for (const entry of entries.slice(0, 8)) {
        if (!withinDays(entry.date, 21)) continue;
        docs.push({
          title: entry.title,
          body: entry.content,
          url: entry.link,
          author: feed.name ?? entry.author,
          publishedAt: entry.date,
          industry: feed.industry,
        });
      }
    } catch {
      failures.push(feed.name || feed.url);
    }
  }
  if (!docs.length) return result("substack", "error", `通讯源都没有读到：${failures.slice(0, 4).join("、")}`);
  return result("substack", "ok", `新文章 ${docs.length} 篇${failures.length ? `，${failures.length} 个源失败` : ""}`, {
    hits: takeHits(docs),
  });
}

export async function collectMedium(ctx: CollectContext): Promise<CollectorResult> {
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  let failures = 0;
  for (const tag of ctx.medium) {
    try {
      const entries = await readFeed(`https://medium.com/feed/tag/${encodeURIComponent(tag.tag)}`, {
        intervalMs: 500,
        hostKey: "medium.com",
      });
      for (const entry of entries.slice(0, 8)) {
        if (!withinDays(entry.date, 21)) continue;
        docs.push({
          title: entry.title,
          body: entry.content.slice(0, 400),
          url: entry.link,
          author: entry.author,
          publishedAt: entry.date,
          industry: tag.industry,
        });
      }
    } catch {
      failures += 1;
    }
  }
  if (!docs.length) return result("medium", "error", "Medium 标签 RSS 没有返回");
  return result("medium", "ok", `标签新文 ${docs.length} 篇${failures ? `，${failures} 个标签失败` : ""}`, { hits: takeHits(docs) });
}

export async function collectGoogleNews(ctx: CollectContext): Promise<CollectorResult> {
  const docs: Parameters<typeof hitsFromDoc>[0][] = [];
  let errors = 0;
  for (const seed of ctx.seeds.slice(0, 8)) {
    const gl = glOf(seed.region);
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(seed.topic)}&hl=en-US&gl=${gl}&ceid=${gl}:en`;
    try {
      const entries = await readFeed(url, { intervalMs: 400, hostKey: "news.google.com" });
      for (const entry of entries.slice(0, 8)) {
        const title = entry.title.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
        docs.push({
          title,
          body: entry.content,
          url: entry.link,
          author: entry.author,
          publishedAt: entry.date,
          industry: seed.industry,
          seedId: seed.id,
        });
      }
    } catch {
      errors += 1;
    }
  }
  if (!docs.length) return result("googlenews", "error", errors ? "Google News RSS 失败" : "没有新闻条目");
  return result("googlenews", "ok", `新闻标题 ${docs.length} 条（验证仍单独走自动补全和每日趋势）`, { hits: takeHits(docs) });
}
