import { guard } from "@/lib/auth";
import { latestDiscovery, listSources, mutateSource, sourceMeta } from "@/lib/sources/query";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") === "x" || url.searchParams.get("platform") === "reddit" ? url.searchParams.get("platform") : "all";
  const industry = url.searchParams.get("industry") || "";
  const detailed = url.searchParams.get("detail") === "1";
  return Response.json({
    ...sourceMeta(),
    run: latestDiscovery(),
    items: listSources(platform as "x" | "reddit" | "all", industry, detailed),
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
