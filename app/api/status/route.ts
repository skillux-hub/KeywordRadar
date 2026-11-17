import { guard } from "@/lib/auth";
import { jobStatus } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  return Response.json(jobStatus());
}
