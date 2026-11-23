export const INDUSTRIES = [
  { slug: "ai", nameZh: "人工智能", nameEn: "AI" },
  { slug: "devtools", nameZh: "开发者工具", nameEn: "Developer tools" },
  { slug: "saas", nameZh: "SaaS / 创业", nameEn: "SaaS" },
  { slug: "crypto", nameZh: "加密货币", nameEn: "Crypto" },
  { slug: "ecommerce", nameZh: "电商 / DTC", nameEn: "Ecommerce" },
  { slug: "marketing", nameZh: "营销 / SEO", nameEn: "Marketing" },
  { slug: "health", nameZh: "健康 / 健身", nameEn: "Health" },
  { slug: "gaming", nameZh: "游戏", nameEn: "Gaming" },
  { slug: "finance", nameZh: "金融", nameEn: "Finance" },
] as const;

export type IndustrySlug = (typeof INDUSTRIES)[number]["slug"];

export const REGIONS = [
  { id: "US", label: "英语 · 美国" },
  { id: "GB", label: "英语 · 英国" },
  { id: "CA", label: "英语 · 加拿大" },
  { id: "AU", label: "英语 · 澳大利亚" },
] as const;

export const STAGES = [
  { id: "earliest", label: "最早窗口", hint: "目前只在早期社区看到，还没有索引页面证据" },
  { id: "spreading", label: "多源发酵", hint: "至少两个早期来源在讨论，仍没有索引页面证据" },
  { id: "published", label: "内容已公开", hint: "新闻、通讯或竞品页已经写到" },
  { id: "on_google", label: "看到索引证据", hint: "有索引页面证据。自动补全或每日趋势不算收录" },
] as const;

export const INTENT_LABEL: Record<string, string> = {
  informational: "信息",
  commercial: "商业",
  comparison: "对比",
  navigational: "导航",
  unknown: "未判定",
};

export const SOURCE_META: {
  id: string;
  nameZh: string;
  role: "discovery" | "validation" | "watch";
  keys: string;
}[] = [
  { id: "hn", nameZh: "Hacker News", role: "discovery", keys: "无需密钥（Algolia）" },
  { id: "producthunt", nameZh: "Product Hunt", role: "discovery", keys: "可选 PRODUCTHUNT_TOKEN；默认同 RSS" },
  { id: "github", nameZh: "GitHub Trending", role: "discovery", keys: "可选 GITHUB_TOKEN" },
  { id: "reddit", nameZh: "Reddit 讨论监控", role: "watch", keys: "可选 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET；否则用公开 RSS" },
  { id: "bluesky", nameZh: "Bluesky", role: "discovery", keys: "无需密钥（AT Protocol 公开接口）" },
  { id: "stackexchange", nameZh: "Stack Exchange", role: "discovery", keys: "可选 STACKEXCHANGE_KEY" },
  { id: "youtube", nameZh: "YouTube", role: "discovery", keys: "频道 RSS 无需密钥；YOUTUBE_API_KEY 用于搜索、标签和评论" },
  { id: "substack", nameZh: "Substack / 通讯", role: "discovery", keys: "无需密钥（RSS）" },
  { id: "medium", nameZh: "Medium", role: "discovery", keys: "无需密钥（标签 RSS）" },
  { id: "googlenews", nameZh: "Google News", role: "discovery", keys: "无需密钥（RSS，作新闻信号，不是趋势验证）" },
  { id: "sitemap", nameZh: "Sitemap 监控", role: "watch", keys: "无需密钥；遵守 robots.txt" },
  { id: "x", nameZh: "X 大V监控", role: "watch", keys: "X_BEARER_TOKEN，或 X_PROVIDER_BASE_URL + X_PROVIDER_API_KEY。都不配则只从社区文本发现账号" },
  { id: "tiktok", nameZh: "TikTok", role: "discovery", keys: "无密钥，尽力读取 Creative Center" },
  { id: "quora", nameZh: "Quora", role: "discovery", keys: "无密钥，尽力读取公开页" },
  { id: "amazon", nameZh: "Amazon Movers", role: "discovery", keys: "无密钥，尽力读取 Movers & Shakers" },
  { id: "etsy", nameZh: "Etsy", role: "discovery", keys: "无密钥，尽力读取趋势页" },
  { id: "discord", nameZh: "Discord", role: "discovery", keys: "DISCORD_BOT_TOKEN 与 DISCORD_CHANNEL_IDS" },
  { id: "telegram", nameZh: "Telegram", role: "discovery", keys: "TELEGRAM_BOT_TOKEN 与 TELEGRAM_CHANNEL_USERNAMES" },
  { id: "threads", nameZh: "Threads", role: "discovery", keys: "THREADS_ACCESS_TOKEN" },
  { id: "google", nameZh: "Google 验证", role: "validation", keys: "无需密钥；自动补全 + 每日趋势 RSS。不作为发现源" },
];

export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCE_META.map((s) => [s.id, s.nameZh]));

export const DEFAULT_SEEDS = [
  { topic: "AI agents", region: "US", industry: "ai" },
  { topic: "AI coding tools", region: "US", industry: "ai" },
  { topic: "SaaS onboarding", region: "US", industry: "saas" },
  { topic: "Shopify apps", region: "US", industry: "ecommerce" },
  { topic: "technical SEO", region: "US", industry: "marketing" },
  { topic: "skincare routine", region: "US", industry: "health" },
  { topic: "indie games", region: "US", industry: "gaming" },
  { topic: "bitcoin etf", region: "US", industry: "crypto" },
  { topic: "personal finance apps", region: "US", industry: "finance" },
];

export const BOOTSTRAP_X: { industry: string; handle: string; name: string }[] = [
  { industry: "ai", handle: "sama", name: "Sam Altman" },
  { industry: "saas", handle: "paulg", name: "Paul Graham" },
  { industry: "crypto", handle: "VitalikButerin", name: "Vitalik Buterin" },
  { industry: "ecommerce", handle: "tobi", name: "Tobi Lutke" },
  { industry: "marketing", handle: "randfish", name: "Rand Fishkin" },
  { industry: "health", handle: "hubermanlab", name: "Andrew Huberman" },
  { industry: "gaming", handle: "GeoffKeighley", name: "Geoff Keighley" },
  { industry: "finance", handle: "morganhousel", name: "Morgan Housel" },
];

export const BOOTSTRAP_SUBREDDITS: { industry: string; name: string }[] = [
  { industry: "ai", name: "MachineLearning" },
  { industry: "saas", name: "startups" },
  { industry: "crypto", name: "CryptoCurrency" },
  { industry: "ecommerce", name: "ecommerce" },
  { industry: "marketing", name: "SEO" },
  { industry: "health", name: "Fitness" },
  { industry: "gaming", name: "gaming" },
  { industry: "finance", name: "personalfinance" },
];

export const X_ACCOUNTS: { industry: string; handle: string; name: string }[] = [
  { industry: "ai", handle: "sama", name: "Sam Altman" },
  { industry: "ai", handle: "karpathy", name: "Andrej Karpathy" },
  { industry: "ai", handle: "ylecun", name: "Yann LeCun" },
  { industry: "ai", handle: "AndrewYNg", name: "Andrew Ng" },
  { industry: "ai", handle: "gdb", name: "Greg Brockman" },
  { industry: "ai", handle: "swyx", name: "swyx" },
  { industry: "ai", handle: "emollick", name: "Ethan Mollick" },
  { industry: "saas", handle: "paulg", name: "Paul Graham" },
  { industry: "saas", handle: "jasonfried", name: "Jason Fried" },
  { industry: "saas", handle: "dhh", name: "DHH" },
  { industry: "saas", handle: "tobi", name: "Tobi Lütke" },
  { industry: "saas", handle: "lennysan", name: "Lenny Rachitsky" },
  { industry: "saas", handle: "naval", name: "Naval" },
  { industry: "saas", handle: "patrickc", name: "Patrick Collison" },
  { industry: "saas", handle: "garrytan", name: "Garry Tan" },
  { industry: "crypto", handle: "VitalikButerin", name: "Vitalik Buterin" },
  { industry: "crypto", handle: "balajis", name: "Balaji Srinivasan" },
  { industry: "crypto", handle: "APompliano", name: "Anthony Pompliano" },
  { industry: "crypto", handle: "cdixon", name: "Chris Dixon" },
  { industry: "crypto", handle: "saylor", name: "Michael Saylor" },
  { industry: "crypto", handle: "cobie", name: "Cobie" },
  { industry: "ecommerce", handle: "tobi", name: "Tobi Lütke" },
  { industry: "ecommerce", handle: "harleyf", name: "Harley Finkelstein" },
  { industry: "ecommerce", handle: "dharmesh", name: "Dharmesh Shah" },
  { industry: "ecommerce", handle: "Shopify", name: "Shopify" },
  { industry: "ecommerce", handle: "taylorholiday", name: "Taylor Holiday" },
  { industry: "marketing", handle: "randfish", name: "Rand Fishkin" },
  { industry: "marketing", handle: "lilyraynyc", name: "Lily Ray" },
  { industry: "marketing", handle: "Aleyda", name: "Aleyda Solis" },
  { industry: "marketing", handle: "neilpatel", name: "Neil Patel" },
  { industry: "marketing", handle: "ahrefs", name: "Ahrefs" },
  { industry: "marketing", handle: "semrush", name: "Semrush" },
  { industry: "health", handle: "hubermanlab", name: "Andrew Huberman" },
  { industry: "health", handle: "peterattiamd", name: "Peter Attia" },
  { industry: "health", handle: "foundmyfitness", name: "Rhonda Patrick" },
  { industry: "health", handle: "drchatterjeeuk", name: "Rangan Chatterjee" },
  { industry: "gaming", handle: "TimSweeneyEpic", name: "Tim Sweeney" },
  { industry: "gaming", handle: "GeoffKeighley", name: "Geoff Keighley" },
  { industry: "gaming", handle: "notch", name: "Markus Persson" },
  { industry: "gaming", handle: "PlayStation", name: "PlayStation" },
  { industry: "gaming", handle: "Xbox", name: "Xbox" },
  { industry: "finance", handle: "chamath", name: "Chamath Palihapitiya" },
  { industry: "finance", handle: "morganhousel", name: "Morgan Housel" },
  { industry: "finance", handle: "BillAckman", name: "Bill Ackman" },
  { industry: "finance", handle: "awealthofcs", name: "Ben Carlson" },
  { industry: "finance", handle: "unusual_whales", name: "Unusual Whales" },
  { industry: "finance", handle: "charliebilello", name: "Charlie Bilello" },
];

export const SUBREDDITS: { industry: string; name: string }[] = [
  { industry: "ai", name: "MachineLearning" },
  { industry: "ai", name: "LocalLLaMA" },
  { industry: "ai", name: "artificial" },
  { industry: "ai", name: "ChatGPT" },
  { industry: "saas", name: "SaaS" },
  { industry: "saas", name: "startups" },
  { industry: "saas", name: "Entrepreneur" },
  { industry: "saas", name: "indiehackers" },
  { industry: "crypto", name: "CryptoCurrency" },
  { industry: "crypto", name: "ethereum" },
  { industry: "crypto", name: "Bitcoin" },
  { industry: "crypto", name: "CryptoTechnology" },
  { industry: "ecommerce", name: "shopify" },
  { industry: "ecommerce", name: "ecommerce" },
  { industry: "ecommerce", name: "FulfillmentByAmazon" },
  { industry: "ecommerce", name: "dropship" },
  { industry: "marketing", name: "SEO" },
  { industry: "marketing", name: "bigseo" },
  { industry: "marketing", name: "marketing" },
  { industry: "marketing", name: "PPC" },
  { industry: "health", name: "Fitness" },
  { industry: "health", name: "loseit" },
  { industry: "health", name: "Biohackers" },
  { industry: "health", name: "SkincareAddiction" },
  { industry: "gaming", name: "gaming" },
  { industry: "gaming", name: "Games" },
  { industry: "gaming", name: "pcgaming" },
  { industry: "gaming", name: "indiegaming" },
  { industry: "finance", name: "personalfinance" },
  { industry: "finance", name: "investing" },
  { industry: "finance", name: "stocks" },
  { industry: "finance", name: "financialindependence" },
];

export const SITES: { industry: string; domain: string; name: string }[] = [
  { industry: "ai", domain: "techcrunch.com", name: "TechCrunch" },
  { industry: "ai", domain: "www.theverge.com", name: "The Verge" },
  { industry: "ai", domain: "openai.com", name: "OpenAI" },
  { industry: "saas", domain: "github.blog", name: "GitHub Blog" },
  { industry: "saas", domain: "stripe.com", name: "Stripe" },
  { industry: "saas", domain: "linear.app", name: "Linear" },
  { industry: "crypto", domain: "www.coindesk.com", name: "CoinDesk" },
  { industry: "crypto", domain: "decrypt.co", name: "Decrypt" },
  { industry: "ecommerce", domain: "www.shopify.com", name: "Shopify" },
  { industry: "ecommerce", domain: "www.practicalecommerce.com", name: "Practical Ecommerce" },
  { industry: "marketing", domain: "searchengineland.com", name: "Search Engine Land" },
  { industry: "marketing", domain: "moz.com", name: "Moz" },
  { industry: "marketing", domain: "ahrefs.com", name: "Ahrefs" },
  { industry: "health", domain: "www.healthline.com", name: "Healthline" },
  { industry: "health", domain: "examine.com", name: "Examine" },
  { industry: "gaming", domain: "www.pcgamer.com", name: "PC Gamer" },
  { industry: "gaming", domain: "www.polygon.com", name: "Polygon" },
  { industry: "finance", domain: "www.investopedia.com", name: "Investopedia" },
  { industry: "finance", domain: "a16z.com", name: "a16z" },
];

export const NEWSLETTERS: { industry: string; name: string; url: string }[] = [
  { industry: "ai", name: "Import AI", url: "https://importai.substack.com/feed" },
  { industry: "ai", name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed" },
  { industry: "saas", name: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com/feed" },
  { industry: "saas", name: "Stratechery", url: "https://stratechery.com/feed" },
  { industry: "saas", name: "The Pragmatic Engineer", url: "https://newsletter.pragmaticengineer.com/feed" },
  { industry: "crypto", name: "Decrypt", url: "https://decrypt.co/feed" },
  { industry: "marketing", name: "SparkToro", url: "https://sparktoro.com/blog/feed/" },
  { industry: "marketing", name: "Ahrefs Blog", url: "https://ahrefs.com/blog/feed/" },
  { industry: "ecommerce", name: "Practical Ecommerce", url: "https://www.practicalecommerce.com/feed" },
  { industry: "health", name: "Peter Attia", url: "https://peterattiamd.com/feed/" },
  { industry: "gaming", name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml" },
  { industry: "finance", name: "a16z", url: "https://a16z.com/feed/" },
];

export const YOUTUBE_CHANNELS: { industry: string; name: string; channelId: string }[] = [
  { industry: "ai", name: "Fireship", channelId: "UCsBjURrPoezykLs9EqgamOA" },
  { industry: "ai", name: "Two Minute Papers", channelId: "UCbfYPyITQ-7l4upoX8nvctg" },
  { industry: "saas", name: "The Verge", channelId: "UCddiUEpeqJcYeBxX1IVBKvQ" },
  { industry: "ecommerce", name: "MKBHD", channelId: "UCBJycsmduvYEL83R_U4JriQ" },
  { industry: "health", name: "Huberman Lab", channelId: "UC2D2CMWXMOVWx7giW1n3LIg" },
  { industry: "gaming", name: "Linus Tech Tips", channelId: "UCXuqSBlHAE6Xw-yeJA0Tunw" },
];

export const MEDIUM_TAGS: { industry: string; tag: string }[] = [
  { industry: "ai", tag: "artificial-intelligence" },
  { industry: "saas", tag: "startup" },
  { industry: "crypto", tag: "cryptocurrency" },
  { industry: "ecommerce", tag: "ecommerce" },
  { industry: "marketing", tag: "seo" },
  { industry: "health", tag: "fitness" },
  { industry: "gaming", tag: "gaming" },
  { industry: "finance", tag: "personal-finance" },
];

export function industryName(slug: string | null | undefined) {
  return INDUSTRIES.find((item) => item.slug === slug)?.nameZh ?? "未分类";
}

export function stageMeta(id: string | null | undefined) {
  return STAGES.find((item) => item.id === id) ?? STAGES[0];
}
