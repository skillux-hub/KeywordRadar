import { guard } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { REGIONS } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({ seeds: all("select id, topic, region, industry, active, created_at from seeds where active = 1 order by id desc") });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json()) as { topic?: string; region?: string; industry?: string };
  const topic = (body.topic || "").trim();
  const region = REGIONS.some((item) => item.id === body.region) ? body.region! : "US";
  if (topic.length < 2 || topic.length > 80) return Response.json({ error: "种子词需要 2 到 80 个字符" }, { status: 400 });
  const industry = body.industry || null;
  const existing = get("select id from seeds where topic = ? and region = ?", topic, region);
  if (existing) {
    run("update seeds set active = 1, industry = coalesce(?, industry) where id = ?", industry, existing.id);
  } else {
    run("insert into seeds (topic, region, industry, active, created_at) values (?, ?, ?, 1, ?)", topic, region, industry, new Date().toISOString());
  }
  return Response.json({ ok: true });
}

export function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "缺少 id" }, { status: 400 });
  run("update seeds set active = 0 where id = ?", id);
  return Response.json({ ok: true });
}
