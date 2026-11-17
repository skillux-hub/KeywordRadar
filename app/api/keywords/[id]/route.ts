import { guard } from "@/lib/auth";
import { keywordDetail } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = guard(request);
  if (denied) return denied;
  return context.params.then((params) => {
    const detail = keywordDetail(Number(params.id));
    if (!detail) return Response.json({ error: "没有这个词" }, { status: 404 });
    return Response.json(detail);
  });
}
