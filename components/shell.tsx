"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "雷达" },
  { href: "/feeds", label: "行业动态" },
  { href: "/watchlists", label: "监控名单" },
  { href: "/sources", label: "数据源" },
  { href: "/digest", label: "日报与回测" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[228px_1fr]">
      <aside className="bg-ink text-[#f6efe4] md:min-h-screen">
        <div className="flex items-center gap-3 px-4 py-4 md:px-5 md:py-6">
          <RadarMark />
          <div>
            <div className="display text-xl leading-none">新词雷达</div>
            <div className="mt-1 text-[11px] tracking-wide text-[#d9cbb8]">英语市场 · 早于 Google</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} data-active={active} className="nav-link shrink-0">
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="px-4 py-5 md:px-8 md:py-7">{children}</main>
    </div>
  );
}

function RadarMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r="16" fill="#b8431f" />
      <circle cx="18" cy="18" r="10" fill="none" stroke="#fff6ee" strokeWidth="1.2" />
      <circle cx="18" cy="18" r="5" fill="none" stroke="#fff6ee" strokeWidth="1.2" />
      <path d="M18 18 L29 10" stroke="#fff6ee" strokeWidth="1.4" />
      <circle cx="18" cy="18" r="1.6" fill="#fff6ee" />
    </svg>
  );
}
