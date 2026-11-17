import { guard } from "@/lib/auth";
import { DETAIL_SIZES, parsePage, parseSize } from "@/lib/pagination";
import { listPosts } from "@/lib/sources/query";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") === "reddit" ? "reddit" : "x";
  const key = (url.searchParams.get("key") || "").replace(/^@/, "").replace(/^\/?r\//i, "").toLowerCase();
  if (!key) return Response.json({ error: "缺少对象" }, { status: 400 });
  return Response.json(listPosts(platform, key, parsePage(url.searchParams.get("page")), parseSize(url.searchParams.get("size"), 10, DETAIL_SIZES)));
}
