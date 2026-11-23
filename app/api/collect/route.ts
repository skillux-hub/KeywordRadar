import { guard } from "@/lib/auth";
import { runProbe } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "需要 JSON 对象" }, { status: 400 });
  }
  const result = await runProbe(body);
  const status = result.http;
  const { http, ...payload } = result;
  void http;
  return Response.json(payload, { status });
}
