"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "雷达" },
  { href: "/feeds", label: "动态" },
  { href: "/watchlists", label: "名单" },
  { href: "/sources", label: "来源" },
  { href: "/digest", label: "日报" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [canLogout, setCanLogout] = useState(false);

  useEffect(() => {
    void fetch("/api/login")
      .then((res) => res.json())
      .then((data) => setCanLogout(Boolean(data.configured)))
      .catch(() => undefined);
    void fetch("/api/status").then((res) => {
      if (res.status === 401 || res.status === 503) window.location.href = "/login";
    });
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[228px_1fr]">
      <aside className="sticky top-0 z-20 bg-ink text-[#f6efe4] md:static md:min-h-screen">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:px-5 md:py-6">
          <div className="flex items-center gap-3">
            <RadarMark />
            <div>
              <div className="display text-xl leading-none">新词雷达</div>
              <div className="mt-1 text-[11px] tracking-wide text-[#d9cbb8]">英语市场 · 早于 Google</div>
            </div>
          </div>
          {canLogout && (
            <button className="text-xs text-[#d9cbb8] md:mt-4 md:block" onClick={() => void logout()}>
              退出
            </button>
          )}
        </div>
        <nav className="hidden px-3 pb-6 md:block md:space-y-1">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} data-active={pathname === link.href} className="nav-link">
              {link.label === "动态" ? "行业动态" : link.label === "名单" ? "监控名单" : link.label === "来源" ? "数据源" : link.label === "日报" ? "日报与回测" : link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-4 pb-24 md:px-8 md:py-7 md:pb-7">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[#3a2e26] bg-ink px-1 pb-[env(safe-area-inset-bottom)] text-[#f6efe4] md:hidden">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} data-active={pathname === link.href} className="nav-link flex-1 justify-center px-1 py-3 text-xs">
            {link.label}
          </Link>
        ))}
      </nav>
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
