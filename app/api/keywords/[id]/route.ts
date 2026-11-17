import { guard } from "@/lib/auth";
import { DETAIL_SIZES, parsePage, parseSize } from "@/lib/pagination";
import { keywordDetail } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guard(request);
  if (denied) return denied;
  return context.params.then((params) => {
    const url = new URL(request.url);
    const detailSize = parseSize(url.searchParams.get("size"), 10, DETAIL_SIZES);
    const detail = keywordDetail(Number(params.id), {
      evidencePage: parsePage(url.searchParams.get("page")),
      evidenceSize: detailSize,
      source: url.searchParams.get("tab") || undefined,
      mentionPage: parsePage(url.searchParams.get("mentionPage")),
      mentionSize: parseSize(url.searchParams.get("mentionSize"), 10, DETAIL_SIZES),
      demandPage: parsePage(url.searchParams.get("demandPage")),
      demandSize: parseSize(url.searchParams.get("demandSize"), 10, DETAIL_SIZES),
      clusterPage: parsePage(url.searchParams.get("clusterPage")),
      clusterSize: parseSize(url.searchParams.get("clusterSize"), 10, DETAIL_SIZES),
      serpPage: parsePage(url.searchParams.get("serpPage")),
      serpSize: parseSize(url.searchParams.get("serpSize"), 10, DETAIL_SIZES),
    });
    if (!detail) return Response.json({ error: "没有这个词" }, { status: 404 });
    return Response.json(detail);
  });
}
