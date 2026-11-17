import { guard } from "@/lib/auth";
import { latestDigest, saveDigest } from "@/lib/digest";
import { readWeights } from "@/lib/score";
import { all, num } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const row = latestDigest();
  const backtest = all<{ lead_hours: number }>(
    "select lead_hours from terms where lead_hours is not null and ifnull(google_at_discovery, 0) = 0 and lead_hours > 0",
  );
  const avg = backtest.length ? backtest.reduce((sum, item) => sum + num(item.lead_hours), 0) / backtest.length : null;
  return Response.json({
    digest: row
      ? {
          id: row.id,
          createdAt: row.created_at,
          trigger: row.trigger,
          payload: JSON.parse(row.payload_json),
          delivery: row.delivery_json ? JSON.parse(row.delivery_json) : null,
        }
      : null,
    backtest: { samples: backtest.length, avgLeadHours: avg, weights: readWeights() },
    schedule: { hour: Number(process.env.DIGEST_HOUR || 8), timeZone: process.env.DIGEST_TZ || "Asia/Shanghai" },
  });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const saved = await saveDigest("manual", true);
  return Response.json(saved);
}
