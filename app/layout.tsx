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
  title: "SEO 新词雷达",
  description: "在 Google 收录之前，从英语市场的早期讨论里找出值得抢的搜索词。",
};

function isProtected(pathname: string) {
  return pathname !== "/login" && !pathname.startsWith("/api/health") && !pathname.startsWith("/api/login") && !pathname.startsWith("/api/logout");
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  if (pathname && isProtected(pathname)) {
    const password = process.env.APP_PASSWORD;
    if (!password) {
      if (process.env.NODE_ENV === "production") redirect("/login?unconfigured=1");
    } else {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!verifySession(token, password)) redirect(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,680&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
