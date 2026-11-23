import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
import { all } from "@/lib/db";
import { jobStatus, listKeywords } from "@/lib/read";

export const dynamic = "force-dynamic";

export default function Page() {
  const recommend = listKeywords({ view: "recommend", window: "7d", page: 1, size: 20 });
  const pending = listKeywords({ view: "pending", noise: "hide", page: 1, size: 20 });
  const raw = listKeywords({ view: "raw", page: 1, size: 1 });
  const excluded = listKeywords({ view: "excluded", page: 1, size: 1 });
  const seeds = all<{ id: number; topic: string; region: string; industry: string | null }>(
    "select id, topic, region, industry from seeds where active = 1 order by id desc",
  );
  return (
    <Suspense>
      <section className="mb-4 grid gap-2 sm:grid-cols-3">
        <h2 className="panel px-4 py-3 text-base font-semibold">正式推荐 <span className="ml-2 text-sm font-normal text-muted">{recommend.total}</span></h2>
        <h2 className="panel px-4 py-3 text-base font-semibold">待核候选 <span className="ml-2 text-sm font-normal text-muted">{pending.total}</span></h2>
        <h2 className="panel px-4 py-3 text-base font-semibold">原始记录 <span className="ml-2 text-sm font-normal text-muted">{raw.total}</span></h2>
      </section>
      <Dashboard
        initial={{
          items: recommend.items,
          total: recommend.total,
          summary: recommend.summary,
          pending: pending.items,
          pendingTotal: pending.total,
          rawTotal: raw.total,
          excludedTotal: excluded.total,
          status: jobStatus(),
          seeds: seeds.map((seed) => ({ id: Number(seed.id), topic: String(seed.topic), region: String(seed.region), industry: seed.industry ? String(seed.industry) : null })),
        }}
      />
    </Suspense>
  );
}
