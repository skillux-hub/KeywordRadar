import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("select 1 as ok").get();
    return Response.json({ ok: true, scheduler: "in-process" });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
