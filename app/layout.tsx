import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "KeywordRadar",
  description: "从英语市场的早期讨论里找候选词。没有索引证据时标为未知，不表示已经领先搜索引擎。",
};

function isProtected(pathname: string) {
  return pathname !== "/login" && !pathname.startsWith("/api/health") && !pathname.startsWith("/api/login") && !pathname.startsWith("/api/logout");
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (pathname && isProtected(pathname)) {
    const password = process.env.APP_PASSWORD;
    if (!password) {
      if (process.env.NODE_ENV === "production" && process.env.PUBLIC_ACCESS !== "true") redirect("/login?unconfigured=1");
    } else {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!verifySession(token, password)) redirect(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
