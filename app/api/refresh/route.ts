import { guard } from "@/lib/auth";
import { beginRefresh } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json(beginRefresh("manual"));
}
