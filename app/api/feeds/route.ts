import { guard } from "@/lib/auth";
import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const industry = new URL(request.url).searchParams.get("industry") || "";
  const where = industry ? "where industry = ?" : "";
  const params = industry ? [industry] : [];
  const items = all(
    `select source, industry, author, title, text, url, engagement, velocity, intent, published_at, fetched_at
     from feed_items ${where}
     order by coalesce(published_at, fetched_at) desc limit 180`,
    ...params,
  );
  return Response.json({
    reddit: items.filter((item) => item.source === "reddit").slice(0, 40),
    x: items.filter((item) => item.source === "x").slice(0, 40),
    pages: items.filter((item) => item.source === "sitemap").slice(0, 40),
  });
}
