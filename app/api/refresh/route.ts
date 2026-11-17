import { beginRefresh } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export function POST() {
  return Response.json(beginRefresh("manual"));
}
