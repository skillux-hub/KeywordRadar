import { guard } from "@/lib/auth";
import { hostnameOf } from "@/lib/utils";
import { INDUSTRIES } from "@/lib/catalog";
import { all, get, run } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({
    industries: INDUSTRIES,
    x: all("select id, industry, handle, display_name, status, origin, reason from x_accounts order by industry, status, handle"),
    subreddits: all("select id, industry, name, status, origin, reason from subreddits order by industry, status, name"),
    redditUsers: all("select id, industry, username, karma, status, origin, reason from reddit_users order by industry, status, username"),
    sites: all("select id, industry, domain, name, status, origin, reason from sites order by industry, status, domain"),
    newsletters: all("select id, industry, name, url, status from newsletters order by industry, name"),
    youtube: all("select id, industry, name, channel_id, status from youtube_channels order by industry, name"),
    medium: all("select id, industry, tag, status from medium_tags order by industry, tag"),
  });
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
