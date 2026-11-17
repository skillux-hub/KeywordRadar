import { classifyIndustries } from "../extract";
import { fetchJson, fetchText } from "../http";
import { decodeHtml } from "../xml";
import { readFeed } from "../rss";
import { hitsFromDoc, result, type CollectorResult } from "./types";

export async function collectTikTok(): Promise<CollectorResult> {
  const api = await fetchJson<{ data?: { list?: { hashtag_name?: string; publish_cnt?: number }[] }; msg?: string }>(
    "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?page=1&limit=20&period=7&country_code=US",
    { browser: true, timeoutMs: 10000, hostKey: "ads.tiktok.com" },
  );
  const names = api.data?.data?.list?.map((row) => row.hashtag_name).filter(Boolean) as string[] | undefined;
  if (names?.length) {
    const hits = names.slice(0, 20).flatMap((name) =>
      hitsFromDoc({ title: name, productName: name, industry: classifyIndustries(name)[0] ?? null, kind: "hashtag" } as Parameters<typeof hitsFromDoc>[0]),
    );
    return result("tiktok", "ok", `Creative Center 返回 ${names.length} 个话题`, { hits });
  }
  const page = await fetchText("https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en", {
    browser: true,
    timeoutMs: 10000,
    hostKey: "ads.tiktok.com",
  });
  const scraped = [...page.text.matchAll(/"hashtagName":"([^"]+)"/g)].map((match) => match[1]);
  if (scraped.length) {
    return result("tiktok", "ok", `从页面解析 ${scraped.length} 个话题`, {
      hits: scraped.slice(0, 20).flatMap((name) => hitsFromDoc({ title: name, productName: name })),
    });
  }
  return result("tiktok", "error", `TikTok 不可用（接口 ${api.data?.msg || api.status}）。已跳过，不影响其他来源。`);
}

export async function collectQuora(): Promise<CollectorResult> {
  try {
    const entries = await readFeed("https://www.quora.com/topic/Technology/rss", { browser: true, intervalMs: 500, hostKey: "www.quora.com" });
    const docs = entries.slice(0, 15).map((entry) => ({ title: entry.title, body: entry.content, url: entry.link }));
    if (!docs.length) return result("quora", "error", "Quora RSS 为空");
    return result("quora", "ok", `问题 ${docs.length} 条`, { hits: docs.flatMap((doc) => hitsFromDoc(doc)) });
  } catch (error) {
    return result("quora", "error", `Quora 被拦截或没有 RSS：${error instanceof Error ? error.message : "失败"}`);
  }
}

export async function collectAmazon(): Promise<CollectorResult> {
  const res = await fetchText("https://www.amazon.com/gp/movers-and-shakers", {
    browser: true,
    timeoutMs: 12000,
    hostKey: "www.amazon.com",
    headers: { "accept-language": "en-US,en;q=0.9" },
  });
  if (!res.ok) return result("amazon", "error", `Movers & Shakers HTTP ${res.status || "失败"}`);
  const titles = [
    ...res.text.matchAll(/class="[^"]*p13n-sc-truncate[^"]*"[^>]*>([^<]{6,140})</g),
    ...res.text.matchAll(/alt="([^"]{6,140})"/g),
  ]
    .map((match) => decodeHtml(match[1]))
    .filter((title) => !/amazon|prime|cart|stars/i.test(title));
  const unique = [...new Set(titles)].slice(0, 15);
  if (unique.length < 3) return result("amazon", "error", "页面没有给出商品列表，多半是反爬页面。已跳过。");
  return result("amazon", "ok", `Movers 商品 ${unique.length} 个`, {
    hits: unique.flatMap((title) => hitsFromDoc({ title, productName: title, industry: "ecommerce", url: "https://www.amazon.com/gp/movers-and-shakers" })),
  });
}

export async function collectEtsy(): Promise<CollectorResult> {
  const res = await fetchText("https://www.etsy.com/trending", { browser: true, timeoutMs: 10000, hostKey: "www.etsy.com" });
  if (!res.ok || /captcha/i.test(res.text)) return result("etsy", "error", "Etsy 返回验证码或拒绝访问。已跳过。");
  const titles = [...res.text.matchAll(/"title":"([^"]{4,80})"/g)]
    .map((match) => decodeHtml(match[1]))
    .filter((title) => !/etsy|sign in|help/i.test(title));
  const unique = [...new Set(titles)].slice(0, 12);
  if (unique.length < 3) return result("etsy", "error", "没有解析到 Etsy 趋势商品。已跳过。");
  return result("etsy", "ok", `趋势商品 ${unique.length} 个`, {
    hits: unique.flatMap((title) => hitsFromDoc({ title, productName: title, industry: "ecommerce" })),
  });
}

export async function collectDiscord(): Promise<CollectorResult> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channels = (process.env.DISCORD_CHANNEL_IDS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!token || !channels.length) {
    return result("discord", "disabled", "未配置 DISCORD_BOT_TOKEN 和 DISCORD_CHANNEL_IDS。只读取机器人已加入的公开频道。");
  }
  const hits = [];
  let count = 0;
  for (const channelId of channels.slice(0, 6)) {
    const res = await fetchJson<{ content?: string; author?: { username?: string }; id?: string; timestamp?: string }[]>(
      `https://discord.com/api/v10/channels/${channelId}/messages?limit=30`,
      {
        timeoutMs: 12000,
        intervalMs: 600,
        hostKey: "discord.com",
        headers: { authorization: `Bot ${token}`, "user-agent": "SEOKeywordRadar (https://localhost, 1.0)" },
      },
    );
    if (!res.ok || !Array.isArray(res.data)) continue;
    for (const message of res.data) {
      if (!message.content) continue;
      count += 1;
      hits.push(
        ...hitsFromDoc({
          title: message.content.slice(0, 160),
          body: message.content,
          author: message.author?.username,
          publishedAt: message.timestamp,
          url: message.id ? `https://discord.com/channels/@me/${channelId}/${message.id}` : undefined,
        }),
      );
    }
  }
  if (!count) return result("discord", "error", "频道消息为空，或机器人不在这些频道里");
  return result("discord", "ok", `读取 ${count} 条消息`, { hits: hits.slice(0, 60) });
}

export async function collectTelegram(): Promise<CollectorResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channels = (process.env.TELEGRAM_CHANNEL_USERNAMES || "").split(",").map((item) => item.trim().replace(/^@/, "")).filter(Boolean);
  if (!token) return result("telegram", "disabled", "未配置 TELEGRAM_BOT_TOKEN。未加入的频道不会被读取。");
  const hits = [];
  let count = 0;
  const updates = await fetchJson<{ result?: { channel_post?: { text?: string; caption?: string; message_id?: number }; message?: { text?: string; message_id?: number } }[] }>(
    `https://api.telegram.org/bot${token}/getUpdates`,
    { timeoutMs: 12000, hostKey: "api.telegram.org" },
  );
  for (const update of updates.data?.result ?? []) {
    const text = update.channel_post?.text || update.channel_post?.caption || update.message?.text;
    if (!text) continue;
    count += 1;
    hits.push(...hitsFromDoc({ title: text.slice(0, 160), body: text }));
  }
  for (const channel of channels.slice(0, 5)) {
    const page = await fetchText(`https://t.me/s/${encodeURIComponent(channel)}`, { browser: true, timeoutMs: 10000, hostKey: "t.me" });
    if (!page.ok) continue;
    const posts = [...page.text.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g)];
    posts.slice(0, 8).forEach((match, index) => {
      const text = decodeHtml(match[1]);
      if (!text) return;
      count += 1;
      hits.push(
        ...hitsFromDoc({
          title: text.slice(0, 160),
          body: text,
          author: channel,
          url: `https://t.me/${channel}/${index + 1}`,
        }),
      );
    });
  }
  if (!count) return result("telegram", "error", "没有读到频道消息。把机器人加进频道，或检查 TELEGRAM_CHANNEL_USERNAMES。");
  return result("telegram", "ok", `读取 ${count} 条公开频道内容`, { hits: hits.slice(0, 50) });
}

export async function collectThreads(): Promise<CollectorResult> {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) return result("threads", "disabled", "未配置 THREADS_ACCESS_TOKEN。");
  const search = await fetchJson<{ data?: { id?: string; text?: string; permalink?: string; timestamp?: string }[] }>(
    `https://graph.threads.net/v1.0/keyword_search?q=${encodeURIComponent("AI tools")}&search_type=RECENT&access_token=${encodeURIComponent(token)}`,
    { timeoutMs: 12000, hostKey: "graph.threads.net" },
  );
  const own = await fetchJson<{ data?: { id?: string; text?: string; permalink?: string; timestamp?: string }[] }>(
    `https://graph.threads.net/v1.0/me/threads?fields=id,text,permalink,timestamp&access_token=${encodeURIComponent(token)}`,
    { timeoutMs: 12000, hostKey: "graph.threads.net" },
  );
  const rows = [...(search.data?.data ?? []), ...(own.data?.data ?? [])].filter((row) => row.text);
  if (!rows.length) return result("threads", "error", "Threads API 没有返回可读帖子。关键字搜索可能未对该 token 开放。");
  return result("threads", rows.length ? "ok" : "error", `帖子 ${rows.length} 条`, {
    hits: rows.flatMap((row) => hitsFromDoc({ title: row.text, body: row.text, url: row.permalink, publishedAt: row.timestamp })),
  });
}
