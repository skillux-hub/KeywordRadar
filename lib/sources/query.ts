import { INDUSTRIES, industryName } from "../catalog";
import { all, get, num, run } from "../db";
import { xProviderConfigured } from "./x-provider";
import { topTopics } from "./stats";
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

function groupedSql(platform: "x" | "reddit", statuses: string[], industry: string) {
  const table = platform === "x" ? "x_accounts" : "subreddits";
  const column = platform === "x" ? "handle" : "name";
  const params: unknown[] = [...statuses];
  let where = `status in (${statuses.map(() => "?").join(",")})`;
  if (industry) {
    where += " and industry = ?";
    params.push(industry);
  }
  return {
    sql: `select '${platform}' as platform, lower(${column}) as key, max(coalesce(heat_score, -1)) as heat from ${table} where ${where} group by lower(${column})`,
    params,
  };
}

export function listSources(platform: "x" | "reddit" | "all", industry: string, page: number, size: number, statuses = ["active", "paused"]) {
  const parts = [];
  if (platform !== "reddit") parts.push(groupedSql("x", statuses, industry));
  if (platform !== "x") parts.push(groupedSql("reddit", statuses, industry));
  const sql = parts.map((part) => part.sql).join(" union all ");
  const params = parts.flatMap((part) => part.params);
  const total = num(get<{ c: number }>(`select count(*) as c from (${sql}) sources`, ...params)?.c);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages);
  const keys = all<{ platform: "x" | "reddit"; key: string }>(
    `select platform, key from (${sql}) sources order by heat desc, platform, key limit ? offset ?`,
    ...params,
    size,
    (current - 1) * size,
  );
  return { items: keys.map((row) => cardFor(row.platform, row.key, statuses)), total, page: current, size };
}

function cardFor(platform: "x" | "reddit", key: string, statuses: string[]): SourceCard {
  const table = platform === "x" ? "x_accounts" : "subreddits";
  const column = platform === "x" ? "handle" : "name";
  const rows = all<Record<string, unknown>>(
    `select * from ${table} where lower(${column}) = ? and status in (${statuses.map(() => "?").join(",")})`,
    key,
    ...statuses,
  );
  const group = rows;
  const primary = [...group].sort((a, b) => num(b.heat_score) - num(a.heat_score))[0];
  const terms = all<{ id: number; display: string }>(
    platform === "x"
      ? `select distinct t.id, t.display from terms t join term_evidence e on e.term_id = t.id
         where e.source = 'x' and lower(e.author) = ? order by t.opportunity_score desc limit 8`
      : `select distinct t.id, t.display from terms t join term_evidence e on e.term_id = t.id
         where e.source = 'reddit' and lower(e.channel) = ? order by t.opportunity_score desc limit 8`,
    key,
  );
  const active = group.find((row) => row.status === "active") ?? primary;
  if (!active) {
    return emptyCard(platform, key);
  }
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
      topics: [],
      posts: [],
      discussion: { ask: 0, pain: 0, compare: 0, recommend: 0, other: 0 },
      terms,
    };
}

function emptyCard(platform: "x" | "reddit", key: string): SourceCard {
  return {
    platform,
    key,
    label: platform === "x" ? `@${key}` : `r/${key}`,
    status: "retired",
    origin: "自动发现",
    reason: "",
    retiredReason: "",
    industries: [],
    industryLabels: [],
    heat: null,
    audience: null,
    activeUsers: null,
    perDay: null,
    avgEngagement: null,
    trend: null,
    topics: [],
    posts: [],
    discussion: { ask: 0, pain: 0, compare: 0, recommend: 0, other: 0 },
    terms: [],
  };
}

export function listPosts(platform: "x" | "reddit", key: string, page: number, size: number) {
  const total = num(get<{ c: number }>("select count(*) as c from source_posts where platform = ? and account_key = ?", platform, key.toLowerCase())?.c);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages);
  const rows = all<{ title: string | null; text: string | null; url: string | null; engagement: number | null; discussion_type: string | null; published_at: string | null }>(
    "select title, text, url, engagement, discussion_type, published_at from source_posts where platform = ? and account_key = ? order by coalesce(engagement, 0) desc, published_at desc limit ? offset ?",
    platform,
    key.toLowerCase(),
    size,
    (current - 1) * size,
  );
  const kinds = all<{ discussion_type: string | null; c: number }>(
    "select discussion_type, count(*) as c from source_posts where platform = ? and account_key = ? group by discussion_type",
    platform,
    key.toLowerCase(),
  );
  const discussion = { ask: 0, pain: 0, compare: 0, recommend: 0, other: 0 };
  for (const row of kinds) {
    const count = num(row.c);
    if (row.discussion_type === "ask" || row.discussion_type === "pain" || row.discussion_type === "compare" || row.discussion_type === "recommend") discussion[row.discussion_type] = count;
    else discussion.other += count;
  }
  return {
    items: rows.map((post) => ({
      title: post.title || post.text || "帖子",
      url: post.url || "",
      engagement: num(post.engagement),
      discussion: post.discussion_type || "other",
      publishedAt: post.published_at || "",
    })),
    topics: topTopics(rows.map((post) => `${post.title || ""} ${post.text || ""}`)),
    discussion,
    total,
    page: current,
    size,
  };
}

export function listEvents(action: "candidate" | "history", platform: "x" | "reddit" | "all", industry: string, page: number, size: number) {
  const params: unknown[] = [];
  let where = action === "candidate" ? "action = 'candidate'" : "action in ('added', 'retired')";
  if (platform !== "all") {
    where += " and platform = ?";
    params.push(platform);
  }
  if (industry) {
    where += " and industry = ?";
    params.push(industry);
  }
  const total = num(get<{ c: number }>(`select count(*) as c from discovery_events where ${where}`, ...params)?.c);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages);
  const items = all(
    `select id, platform, industry, account_key, action, reason, score, evidence_url, created_at from discovery_events where ${where} order by id desc limit ? offset ?`,
    ...params,
    size,
    (current - 1) * size,
  );
  return { items, total, page: current, size };
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
