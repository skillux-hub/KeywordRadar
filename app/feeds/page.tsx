"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { ago } from "@/lib/utils";

type Item = { industry: string | null; author: string | null; title: string | null; text: string | null; url: string | null; published_at: string | null; velocity: number | null };
type Meta = { industries: { slug: string; nameZh: string }[] };

export default function FeedsPage() {
  const [industry, setIndustry] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [xDisabled, setXDisabled] = useState(false);
  const [data, setData] = useState<{ reddit: Item[]; x: Item[]; pages: Item[] }>({ reddit: [], x: [], pages: [] });

  useEffect(() => {
    void fetch("/api/meta").then((res) => res.json()).then(setMeta);
    void fetch("/api/status").then((res) => res.json()).then((status) => setXDisabled(Boolean(status.xDisabled)));
  }, []);

  useEffect(() => {
    const load = () => void fetch(`/api/feeds?industry=${industry}`).then((res) => res.json()).then(setData);
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [industry]);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">行业动态</h1>
          <p className="mt-2 text-sm text-muted">Reddit 新帖、X 大V时间线、竞品 sitemap 新 URL。按行业看，不按关键词打散。</p>
        </div>
        <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm sm:w-auto" value={industry} onChange={(event) => setIndustry(event.target.value)}>
          <option value="">全部行业</option>
          {meta?.industries.map((item) => <option key={item.slug} value={item.slug}>{item.nameZh}</option>)}
        </select>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <Column title="Reddit 讨论" items={data.reddit} empty="这一轮还没有社区帖。公开 JSON 被拦时会改用 RSS。" />
        <Column title="X 大V" items={data.x} empty={xDisabled ? "未配置 X_BEARER_TOKEN，时间线暂停。不会去关注任何账号。" : "这轮还没有拉到帖子。"} />
        <Column title="竞品新页面" items={data.pages} empty="还没有 72 小时内新增、且带 lastmod 的 URL。第一次跑会先建立基线。" />
      </div>
    </Shell>
  );
}

function Column({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <section className="panel p-4">
      <h2 className="font-medium">{title}</h2>
      {!items.length && <p className="mt-3 text-sm text-muted">{empty}</p>}
      <ul className="mt-3 space-y-3">
        {items.slice(0, 12).map((item, index) => (
          <li key={`${item.url}-${index}`} className="text-sm">
            <div className="text-xs text-muted">{item.author} · {ago(item.published_at)}{item.velocity ? ` · 热度 ${item.velocity.toFixed(1)}/时` : ""}</div>
            {item.url ? <a className="break-words text-primary" href={item.url} target="_blank" rel="noreferrer">{item.title || item.text}</a> : <span className="break-words">{item.title}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
