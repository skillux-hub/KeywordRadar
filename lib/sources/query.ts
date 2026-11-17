import { INDUSTRIES, industryName } from "../catalog";
import { all, get, num, run } from "../db";
import { xProviderConfigured } from "./x-provider";
import { discussionBreakdown, topTopics } from "./stats";
import { parseSubredditInput, parseXInput } from "./metrics";

export type SourceCard = {
  platform: "x" | "reddit";
  key: string;
  label: string;
  status: string;
  origin: string;
  reason: string;
  retiredReason: string;
  industries: string[];
  industryLabels: string[];
  heat: number | null;
  audience: number | null;
  activeUsers: number | null;
  perDay: number | null;
  avgEngagement: number | null;
  trend: number | null;
  topics: string[];
  posts: { title: string; url: string; engagement: number; discussion: string; publishedAt: string }[];
  discussion: { ask: number; pain: number; compare: number; recommend: number; other: number };
  terms: { id: number; display: string }[];
};

function originLabel(origin: string) {
  if (origin === "user") return "手动";
  if (origin === "bootstrap") return "起步";
  if (origin === "seed") return "起步";
  return "自动发现";
}

export function listSources(platform: "x" | "reddit" | "all", industry = "", detailed = false): SourceCard[] {
  const cards: SourceCard[] = [];
  if (platform !== "reddit") cards.push(...rowsFor("x", detailed));
  if (platform !== "x") cards.push(...rowsFor("reddit", detailed));
  const filtered = industry ? cards.filter((card) => card.industries.includes(industry)) : cards;
  return filtered.sort((a, b) => (b.heat ?? -1) - (a.heat ?? -1));
}

function rowsFor(platform: "x" | "reddit", detailed: boolean): SourceCard[] {
  const table = platform === "x" ? "x_accounts" : "subreddits";
  const column = platform === "x" ? "handle" : "name";
  const rows = all<Record<string, unknown>>(`select * from ${table} where status != 'suggested'`);
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row[column] || "").toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }
  return [...grouped.entries()].map(([key, group]) => {
    const primary = [...group].sort((a, b) => num(b.heat_score) - num(a.heat_score))[0];
    const posts = detailed
      ? all<{ title: string | null; text: string | null; url: string | null; engagement: number | null; discussion_type: string | null; published_at: string | null }>(
          "select title, text, url, engagement, discussion_type, published_at from source_posts where platform = ? and account_key = ? order by engagement desc limit 20",
          platform,
          key,
        )
      : [];
    const terms = detailed
      ? all<{ id: number; display: string }>(
          platform === "x"
            ? `select distinct t.id, t.display from terms t join term_evidence e on e.term_id = t.id
               where e.source = 'x' and lower(e.author) = ? order by t.opportunity_score desc limit 8`
            : `select distinct t.id, t.display from terms t join term_evidence e on e.term_id = t.id
               where e.source = 'reddit' and lower(e.channel) = ? order by t.opportunity_score desc limit 8`,
          key,
        )
      : [];
    const active = group.find((row) => row.status === "active") ?? primary;
    return {
      platform,
      key,
      label: platform === "x" ? `@${key}` : `r/${String(active[column] || key)}`,
      status: group.some((row) => row.status === "active") ? "active" : String(active.status || "retired"),
      origin: originLabel(String(active.origin || "discovered")),
      reason: String(active.discovered_reason || ""),
      retiredReason: String(active.retired_reason || ""),
      industries: [...new Set(group.map((row) => String(row.industry)))],
      industryLabels: [...new Set(group.map((row) => industryName(String(row.industry))))],
      heat: active.heat_score == null ? null : num(active.heat_score),
      audience: platform === "x" ? (active.followers == null ? null : num(active.followers)) : active.subscribers == null ? null : num(active.subscribers),
      activeUsers: active.active_users == null ? null : num(active.active_users),
      perDay: active.posts_per_day == null ? null : num(active.posts_per_day),
      avgEngagement: active.avg_engagement == null ? null : Math.round(num(active.avg_engagement)),
      trend: active.trend == null ? null : num(active.trend),
      topics: detailed ? topTopics(posts.map((post) => `${post.title || ""} ${post.text || ""}`)) : [],
      posts: posts.slice(0, 4).map((post) => ({
        title: post.title || post.text || "帖子",
        url: post.url || "",
        engagement: num(post.engagement),
        discussion: post.discussion_type || "other",
        publishedAt: post.published_at || "",
      })),
      discussion: discussionBreakdown(posts.map((post) => post.discussion_type || "other")),
      terms,
    };
  });
}

export function latestDiscovery() {
  return get<{ started_at: string; finished_at: string | null; candidates: number; added: number; retired: number; message: string | null; trigger: string }>(
    "select started_at, finished_at, candidates, added, retired, message, trigger from discovery_runs order by id desc limit 1",
  );
}

export function sourceMeta() {
  return {
    industries: INDUSTRIES,
    xConfigured: xProviderConfigured(),
    xNotice: xProviderConfigured() ? "已配置 X 数据接口，会读时间线并参与发现。" : "未配置 X 数据接口。名单仍可自动发现，时间线和粉丝数要等接口配好。",
    limits: {
      x: discoveryLimitSafe("X_DISCOVERY_LIMIT", 30),
      reddit: discoveryLimitSafe("SUBREDDIT_DISCOVERY_LIMIT", 15),
      days: discoveryLimitSafe("DISCOVERY_INTERVAL_DAYS", 7),
    },
  };
}

function discoveryLimitSafe(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function mutateSource(body: { op?: string; platform?: string; key?: string; value?: string; industries?: string[] }) {
  const platform = body.platform === "reddit" ? "reddit" : body.platform === "x" ? "x" : "";
  if (!platform) return { error: "请选择平台" };
  if (body.op === "add") {
    const keys = platform === "x" ? parseXInput(body.value || body.key || "") : parseSubredditInput(body.value || body.key || "");
    const industries = (body.industries || []).filter((item) => INDUSTRIES.some((industry) => industry.slug === item));
    if (!keys.length) return { error: platform === "x" ? "没有识别出账号" : "没有识别出板块" };
    if (!industries.length) return { error: "手动添加时请选一个行业" };
    for (const key of keys) {
      for (const industry of industries) {
        if (platform === "x") {
          run(
            `insert into x_accounts (industry, handle, status, origin, discovered_reason) values (?, ?, 'active', 'user', '手动添加')
             on conflict(industry, handle) do update set status = 'active', origin = 'user', retired_reason = null`,
            industry,
            key.toLowerCase(),
          );
        } else {
          const existing = get("select id from subreddits where industry = ? and lower(name) = lower(?)", industry, key);
          if (existing) run("update subreddits set status = 'active', origin = 'user', retired_reason = null where industry = ? and lower(name) = lower(?)", industry, key);
          else run("insert into subreddits (industry, name, status, origin, discovered_reason) values (?, ?, 'active', 'user', '手动添加')", industry, key);
        }
      }
    }
    return { ok: true };
  }
  const key = (body.key || "").replace(/^@/, "").replace(/^\/?r\//i, "").toLowerCase();
  if (!key) return { error: "缺少对象" };
  const table = platform === "x" ? "x_accounts" : "subreddits";
  const column = platform === "x" ? "handle" : "name";
  if (body.op === "pause") {
    run(`update ${table} set status = 'paused' where lower(${column}) = ? and status = 'active'`, key);
  } else if (body.op === "resume") {
    run(`update ${table} set status = 'active', retired_reason = null where lower(${column}) = ? and status = 'paused'`, key);
  } else if (body.op === "remove") {
    run(`update ${table} set status = 'rejected', retired_reason = '用户移除' where lower(${column}) = ?`, key);
  } else if (body.op === "industries") {
    const industries = (body.industries || []).filter((item) => INDUSTRIES.some((industry) => industry.slug === item));
    const current = all<{ industry: string }>(`select industry from ${table} where lower(${column}) = ?`, key);
    for (const row of current) {
      if (!industries.includes(row.industry)) run(`update ${table} set status = 'rejected', retired_reason = '用户调整行业' where lower(${column}) = ? and industry = ?`, key, row.industry);
    }
    for (const industry of industries) {
      if (platform === "x") {
        run(
          `insert into x_accounts (industry, handle, status, origin, discovered_reason) values (?, ?, 'active', 'user', '手动调整行业')
           on conflict(industry, handle) do update set status = 'active', origin = 'user'`,
          industry,
          key,
        );
      } else if (!current.some((row) => row.industry === industry)) {
        run("insert into subreddits (industry, name, status, origin, discovered_reason) values (?, ?, 'active', 'user', '手动调整行业')", industry, key);
      } else {
        run("update subreddits set status = 'active', origin = 'user' where lower(name) = ? and industry = ?", key, industry);
      }
    }
  } else {
    return { error: "未知操作" };
  }
  return { ok: true };
}
