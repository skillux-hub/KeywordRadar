import { jobStatus } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(jobStatus());
}
