import { guard } from "@/lib/auth";
import { enrichHistory } from "@/lib/history-run";

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
  const result = await enrichHistory(body);
  const { http, ...payload } = result;
  return Response.json(payload, { status: http });
}
