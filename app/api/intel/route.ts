import { guard } from "@/lib/auth";
import { DETAIL_SIZES, parsePage, parseSize } from "@/lib/pagination";
import { latestDiscovery, listEvents, listSources, mutateSource, sourceMeta } from "@/lib/sources/query";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") === "x" || url.searchParams.get("platform") === "reddit" ? url.searchParams.get("platform") : "all";
  const industry = url.searchParams.get("industry") || "";
  const page = parsePage(url.searchParams.get("page"));
  const size = parseSize(url.searchParams.get("size"));
  const kind = platform as "x" | "reddit" | "all";
  return Response.json({
    ...sourceMeta(),
    run: latestDiscovery(),
    items: listSources(kind, industry, page, size),
    retired: listSources(kind, industry, parsePage(url.searchParams.get("retiredPage")), parseSize(url.searchParams.get("retiredSize"), 10, DETAIL_SIZES), ["retired", "rejected"]),
    candidates: listEvents("candidate", kind, industry, parsePage(url.searchParams.get("candidatePage")), parseSize(url.searchParams.get("candidateSize"), 10, DETAIL_SIZES)),
    history: listEvents("history", kind, industry, parsePage(url.searchParams.get("historyPage")), parseSize(url.searchParams.get("historySize"), 10, DETAIL_SIZES)),
  });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json()) as { op?: string; platform?: string; key?: string; value?: string; industries?: string[] };
  const result = mutateSource(body);
  if ("error" in result && result.error) return Response.json(result, { status: 400 });
  return Response.json(result);
}
