import { guard } from "@/lib/auth";
import { parsePage, parseSize } from "@/lib/pagination";
import { listKeywords } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const data = listKeywords({
    industry: url.searchParams.get("industry") || undefined,
    source: url.searchParams.get("source") || undefined,
    stage: url.searchParams.get("stage") || undefined,
    window: url.searchParams.get("window") || "7d",
    seed: url.searchParams.get("seed") || undefined,
    q: url.searchParams.get("q") || undefined,
    shape: url.searchParams.get("shape") || undefined,
    view: url.searchParams.get("view") === "pending" ? "pending" : "recommend",
    page: parsePage(url.searchParams.get("page")),
    size: parseSize(url.searchParams.get("size")),
  });
  return Response.json(data);
}
