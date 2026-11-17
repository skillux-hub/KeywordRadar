import { guard } from "@/lib/auth";
import { all, get, num } from "@/lib/db";
import { parsePage, parseSize } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const industry = url.searchParams.get("industry") || "";
  const size = parseSize(url.searchParams.get("size"));
  return Response.json({
    reddit: feedPage("reddit", industry, parsePage(url.searchParams.get("redditPage")), size),
    x: feedPage("x", industry, parsePage(url.searchParams.get("xPage")), size),
    pages: feedPage("sitemap", industry, parsePage(url.searchParams.get("sitePage")), size),
  });
}

function feedPage(source: string, industry: string, page: number, size: number) {
  const params: unknown[] = [source];
  let where = "source = ?";
  if (industry) {
    where += " and industry = ?";
    params.push(industry);
  }
  const total = num(get<{ c: number }>(`select count(*) as c from feed_items where ${where}`, ...params)?.c);
  const pages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(page, pages);
  const items = all(
    `select source, industry, author, title, text, url, engagement, velocity, intent, published_at, fetched_at
     from feed_items where ${where} order by coalesce(published_at, fetched_at) desc limit ? offset ?`,
    ...params,
    size,
    (current - 1) * size,
  );
  return { items, total, page: current, size };
}
