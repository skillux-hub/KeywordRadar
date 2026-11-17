"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES, pageWindow } from "@/lib/pagination";

export function Pagination({
  page,
  size,
  total,
  pageParam = "page",
  sizeParam = "size",
  sizes = PAGE_SIZES,
}: {
  page: number;
  size: number;
  total: number;
  pageParam?: string;
  sizeParam?: string;
  sizes?: readonly number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
  const current = Math.min(Math.max(1, page), pages);
  if (total <= 0) return null;

  function go(nextPage: number, nextSize = size) {
    const params = new URLSearchParams(search.toString());
    const sizeChanged = nextSize !== size;
    const target = sizeChanged ? 1 : nextPage;
    if (target <= 1) params.delete(pageParam);
    else params.set(pageParam, String(target));
    if (nextSize === sizes[0]) params.delete(sizeParam);
    else params.set(sizeParam, String(nextSize));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const tokens = pageWindow(current, pages);
  return (
    <nav className="mt-3 flex flex-col gap-2 text-sm" aria-label="分页">
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 disabled:text-faint" disabled={current <= 1} onClick={() => go(current - 1)}>上一页</button>
        <span className="text-muted">第 {current} / {pages} 页</span>
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 disabled:text-faint" disabled={current >= pages} onClick={() => go(current + 1)}>下一页</button>
      </div>
      <div className="hidden flex-wrap items-center gap-1 sm:flex">
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 disabled:text-faint" disabled={current <= 1} onClick={() => go(current - 1)}>上一页</button>
        {tokens.map((token, index) =>
          token === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-faint">…</span>
          ) : (
            <button key={token} type="button" className={`h-8 min-w-8 rounded-lg px-2 ${token === current ? "btn-primary" : "border border-border"}`} onClick={() => go(token)}>
              {token}
            </button>
          ),
        )}
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 disabled:text-faint" disabled={current >= pages} onClick={() => go(current + 1)}>下一页</button>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>共 {total} 条</span>
        <label className="flex items-center gap-1">
          每页
          <select className="field h-8 w-auto px-2" value={size} onChange={(event) => go(1, Number(event.target.value))}>
            {sizes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
    </nav>
  );
}
