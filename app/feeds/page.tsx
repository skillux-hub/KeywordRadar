"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "@/components/external-link";
import { Pagination } from "@/components/pagination";
import { Shell } from "@/components/shell";
import { redditUserUrl, safeExternalUrl, xProfile } from "@/lib/source-links";
import { ago } from "@/lib/utils";

type Item = { source?: string; industry: string | null; author: string | null; title: string | null; text: string | null; url: string | null; published_at: string | null; velocity: number | null };
type FeedPage = { items: Item[]; total: number; page: number; size: number };
type Meta = { industries: { slug: string; nameZh: string }[] };

export default function FeedsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const industry = search.get("industry") || "";
  const [meta, setMeta] = useState<Meta | null>(null);
  const [xDisabled, setXDisabled] = useState(false);
  const emptyPage = { items: [], total: 0, page: 1, size: 20 };
  const [data, setData] = useState<{ reddit: FeedPage; x: FeedPage; pages: FeedPage; hn: FeedPage; producthunt: FeedPage; github: FeedPage; news: FeedPage }>({
    reddit: emptyPage, x: emptyPage, pages: emptyPage, hn: emptyPage, producthunt: emptyPage, github: emptyPage, news: emptyPage,
  });

  useEffect(() => {
    void fetch("/api/meta").then((res) => res.json()).then(setMeta);
    void fetch("/api/status").then((res) => res.json()).then((status) => setXDisabled(Boolean(status.xDisabled)));
  }, []);

  useEffect(() => {
    const load = () => void fetch(`/api/feeds?${search.toString()}`).then((res) => res.json()).then(setData);
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [search]);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">行业动态</h1>
          <p className="mt-2 text-sm text-muted">Reddit 新帖、X 大V时间线、竞品 sitemap 新 URL。按行业看，不按关键词打散。</p>
        </div>
        <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm sm:w-auto" value={industry} onChange={(event) => {
          const params = new URLSearchParams(search.toString());
          const value = event.target.value;
          if (value) params.set("industry", value); else params.delete("industry");
          for (const key of ["redditPage", "xPage", "sitePage", "hnPage", "phPage", "ghPage", "newsPage"]) params.delete(key);
          const next = params.toString();
          router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        }}>
          <option value="">全部行业</option>
          {meta?.industries.map((item) => <option key={item.slug} value={item.slug}>{item.nameZh}</option>)}
        </select>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <Column title="Reddit 讨论" page={data.reddit} pageParam="redditPage" empty="这一轮还没有社区帖。公开 JSON 被拦时会改用 RSS。" />
        <Column title="X 大V" page={data.x} pageParam="xPage" empty={xDisabled ? "未配置 X 数据接口，时间线暂停。不会去关注任何账号。" : "这轮还没有拉到帖子。"} />
        <Column title="竞品新页面" page={data.pages} pageParam="sitePage" empty="还没有 72 小时内新增、且带 lastmod 的 URL。第一次跑会先建立基线。" />
        <Column title="Hacker News" page={data.hn} pageParam="hnPage" empty="还没有 HN 帖子。" />
        <Column title="Product Hunt" page={data.producthunt} pageParam="phPage" empty="还没有 Product Hunt 条目。" />
        <Column title="GitHub" page={data.github} pageParam="ghPage" empty="还没有仓库动态。" />
        <Column title="新闻与通讯" page={data.news} pageParam="newsPage" empty="还没有新闻或通讯。" />
      </div>
    </Shell>
  );
}

function Column({ title, page, pageParam, empty }: { title: string; page: FeedPage; pageParam: string; empty: string }) {
  const items = page?.items || [];
  return (
    <section className="panel p-4">
      <h2 className="font-medium">{title}</h2>
      {!items.length && <p className="mt-3 text-sm text-muted">{empty}</p>}
      <ul className="mt-3 space-y-3">
        {items.map((item, index) => (
          <li key={`${item.url}-${index}`} className="text-sm">
            <div className="break-words text-xs text-muted">
              {item.author && item.source === "x" ? <ExternalLink href={xProfile(item.author)}>@{item.author}</ExternalLink> : null}
              {item.author && item.source === "reddit" ? <ExternalLink href={redditUserUrl(item.author)}>u/{item.author}</ExternalLink> : null}
              {item.author && item.source !== "x" && item.source !== "reddit" ? <span>{item.author}</span> : null}
              <span> · {ago(item.published_at)}{item.velocity ? ` · 热度 ${item.velocity.toFixed(1)}/时` : ""}</span>
            </div>
            <ExternalLink href={safeExternalUrl(item.url)}>{item.title || item.text || item.url || "无标题"}</ExternalLink>
          </li>
        ))}
      </ul>
      <Pagination page={page?.page || 1} size={page?.size || 20} total={page?.total || 0} pageParam={pageParam} />
    </section>
  );
}
