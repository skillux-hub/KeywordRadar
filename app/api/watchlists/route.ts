import { guard } from "@/lib/auth";
import { hostnameOf } from "@/lib/utils";
import { INDUSTRIES } from "@/lib/catalog";
import { all, get, num, run } from "@/lib/db";
import { parsePage, parseSize } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const industry = url.searchParams.get("industry") || "";
  const size = parseSize(url.searchParams.get("size"));
  const suggestSize = parseSize(url.searchParams.get("suggestSize"), 20);
  return Response.json({
    industries: INDUSTRIES,
    x: paged("x_accounts", "status, handle", industry, parsePage(url.searchParams.get("xPage")), size, "active"),
    subreddits: paged("subreddits", "status, name", industry, parsePage(url.searchParams.get("subPage")), size, "active"),
    redditUsers: paged("reddit_users", "status, username", industry, parsePage(url.searchParams.get("userPage")), size, "active"),
    sites: paged("sites", "status, domain", industry, parsePage(url.searchParams.get("sitePage")), size, "active"),
    xSuggested: paged("x_accounts", "handle", industry, parsePage(url.searchParams.get("xSuggest")), suggestSize, "suggested"),
    subredditsSuggested: paged("subreddits", "name", industry, parsePage(url.searchParams.get("subSuggest")), suggestSize, "suggested"),
    redditUsersSuggested: paged("reddit_users", "username", industry, parsePage(url.searchParams.get("userSuggest")), suggestSize, "suggested"),
    sitesSuggested: paged("sites", "domain", industry, parsePage(url.searchParams.get("siteSuggest")), suggestSize, "suggested"),
  });
}

function paged(table: string, order: string, industry: string, page: number, size: number, status: string) {
  const params: unknown[] = [status];
  let where = "status = ?";
  if (industry) {
    where += " and industry = ?";
    params.push(industry);
  }
  const total = num(get<{ c: number }>(`select count(*) as c from ${table} where ${where}`, ...params)?.c);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages);
  const items = all(`select * from ${table} where ${where} order by ${order} limit ? offset ?`, ...params, size, (current - 1) * size);
  return { items, total, page: current, size };
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json()) as { op?: string; kind?: string; industry?: string; value?: string; id?: number; name?: string };
  const op = body.op;
  const industry = body.industry || "";
  if (!INDUSTRIES.some((item) => item.slug === industry) && op === "add") {
    return Response.json({ error: "请选择行业" }, { status: 400 });
  }
  if (op === "approve" || op === "reject" || op === "remove") {
    const status = op === "approve" ? "active" : "rejected";
    const id = Number(body.id);
    if (!id) return Response.json({ error: "缺少 id" }, { status: 400 });
    const table = tableOf(body.kind || "");
    if (!table) return Response.json({ error: "类型不对" }, { status: 400 });
    if (op === "remove") run(`delete from ${table} where id = ?`, id);
    else run(`update ${table} set status = ? where id = ?`, status, id);
    return Response.json({ ok: true });
  }
  if (op !== "add") return Response.json({ error: "未知操作" }, { status: 400 });
  try {
    return await addWatch(body, industry);
  } catch {
    return Response.json({ error: "已经在名单里，或格式和现有记录冲突" }, { status: 400 });
  }
}

async function addWatch(body: { kind?: string; value?: string; name?: string }, industry: string) {
  const value = (body.value || "").trim();
  if (!value) return Response.json({ error: "内容不能为空" }, { status: 400 });
  if (body.kind === "x") {
    const handle = value.replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/i.test(handle)) return Response.json({ error: "账号格式不对" }, { status: 400 });
    if (get("select id from x_accounts where industry = ? and handle = ?", industry, handle)) return Response.json({ ok: true });
    run("insert into x_accounts (industry, handle, status, origin) values (?, ?, 'active', 'user')", industry, handle);
  } else if (body.kind === "subreddit") {
    const name = value.replace(/^\/?r\//i, "");
    if (!/^[A-Za-z0-9_]{3,21}$/.test(name)) return Response.json({ error: "子版名格式不对" }, { status: 400 });
    run("insert into subreddits (industry, name, status, origin) values (?, ?, 'active', 'user')", industry, name);
  } else if (body.kind === "reddit_user") {
    const username = value.replace(/^\/?u\//i, "");
    run("insert into reddit_users (industry, username, status, origin) values (?, ?, 'active', 'user')", industry, username);
  } else if (body.kind === "site") {
    const domain = hostnameOf(value);
    if (!domain) return Response.json({ error: "请输入域名，例如 moz.com" }, { status: 400 });
    run("insert into sites (industry, domain, name, status, origin) values (?, ?, ?, 'active', 'user')", industry, domain, body.name || domain);
  } else if (body.kind === "newsletter") {
    if (!/^https?:\/\//i.test(value)) return Response.json({ error: "需要 RSS 地址" }, { status: 400 });
    run("insert into newsletters (industry, name, url, status) values (?, ?, ?, 'active')", industry, body.name || value, value);
  } else if (body.kind === "youtube") {
    if (!/^UC[\w-]{20,}$/.test(value)) return Response.json({ error: "需要 YouTube channel id" }, { status: 400 });
    run("insert into youtube_channels (industry, name, channel_id, status) values (?, ?, ?, 'active')", industry, body.name || value, value);
  } else if (body.kind === "medium") {
    run("insert into medium_tags (industry, tag, status) values (?, ?, 'active')", industry, value.toLowerCase());
  } else {
    return Response.json({ error: "类型不对" }, { status: 400 });
  }
  return Response.json({ ok: true });
}

function tableOf(kind: string) {
  const tables: Record<string, string> = {
    x: "x_accounts",
    subreddit: "subreddits",
    reddit_user: "reddit_users",
    site: "sites",
    newsletter: "newsletters",
    youtube: "youtube_channels",
    medium: "medium_tags",
  };
  return tables[kind] ?? null;
}
