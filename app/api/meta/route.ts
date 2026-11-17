import { guard } from "@/lib/auth";
import { INDUSTRIES, REGIONS, SOURCE_META, STAGES } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json({ industries: INDUSTRIES, regions: REGIONS, stages: STAGES, sources: SOURCE_META });
}
