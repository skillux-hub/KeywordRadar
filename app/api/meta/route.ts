import { INDUSTRIES, REGIONS, SOURCE_META, STAGES } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ industries: INDUSTRIES, regions: REGIONS, stages: STAGES, sources: SOURCE_META });
}
