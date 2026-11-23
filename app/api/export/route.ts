import { guard } from "@/lib/auth";
import { listKeywords } from "@/lib/read";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const { items } = listKeywords({
    industry: url.searchParams.get("industry") || undefined,
    source: url.searchParams.get("source") || undefined,
    stage: url.searchParams.get("stage") || undefined,
    window: url.searchParams.get("window") || "7d",
    seed: url.searchParams.get("seed") || undefined,
    q: url.searchParams.get("q") || undefined,
    shape: url.searchParams.get("shape") || undefined,
    all: true,
  });
  const header = ["关键词", "阶段", "机会分", "发现分", "意图", "来源", "行业", "首次发现", "索引证据", "摘要"];
  const lines = items.map((item) =>
    [item.term, item.stageLabel, item.opportunity, item.discovery, item.intentLabel, item.sourceLabels.join("|"), item.industryLabels.join("|"), item.firstSeen, item.onGoogle ? "是" : "否", item.summary]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = `\uFEFF${header.join(",")}\n${lines.join("\n")}\n`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=seo-radar.csv",
    },
  });
}
