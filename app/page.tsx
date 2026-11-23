import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { all } from "@/lib/db";
import { jobStatus, listKeywords } from "@/lib/read";

export const dynamic = "force-dynamic";

export default function Page() {
  const recommend = listKeywords({ view: "recommend", window: "7d", page: 1, size: 20 });
  const pending = listKeywords({ view: "pending", noise: "hide", page: 1, size: 20 });
  const raw = listKeywords({ view: "raw", page: 1, size: 1 });
  const seeds = all<{ id: number; topic: string; region: string; industry: string | null }>(
    "select id, topic, region, industry from seeds where active = 1 order by id desc",
  );
  return (
    <Suspense>
      <Dashboard
        initial={{
          items: recommend.items,
          total: recommend.total,
          summary: recommend.summary,
          pending: pending.items,
          pendingTotal: pending.total,
          rawTotal: raw.total,
          status: jobStatus(),
          seeds,
        }}
      />
    </Suspense>
  );
}
