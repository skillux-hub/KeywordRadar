import assert from "node:assert/strict";
import test from "node:test";
import { judgeBirth, judgeSearch } from "../lib/novelty.ts";

const now = Date.parse("2026-11-19T12:00:00Z");
const within = (hours: number) => new Date(now - hours * 3600000).toISOString();

test("an old name with a young domain is not admitted", () => {
  const verdict = judgeBirth({
    term: "TeamViewer",
    industries: ["devtools"],
    sightings: [
      { source: "x", industry: "devtools", at: within(2), url: "https://x.com/a/status/1", author: "ann", title: "still using it" },
      { source: "reddit", industry: "devtools", at: within(3), url: "https://www.reddit.com/r/programming/comments/abc", author: "bob", title: "remote desktop again" },
    ],
    ageEvidence: [{ kind: "domain_registered", at: within(24) }],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "established");
});

test("a young domain or repo alone does not admit a name", () => {
  const verdict = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [],
    ageEvidence: [{ kind: "domain_registered", at: within(10) }, { kind: "repo_created", at: within(10) }],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
  assert.match(verdict.reason, /不能单独放行|窗口/);
});

test("missing search credentials stay unknown", () => {
  const verdict = judgeSearch({ suggest: null, trends: null, dataForSeoConfigured: false, dataForSeo: null });
  assert.equal(verdict.status, "unknown");
  assert.match(verdict.note, /未知|不能写成已有收录|不能写成未收录/);
  assert.equal(judgeSearch({ suggest: null, trends: null, dataForSeo: "error" }).status, "unknown");
});

test("autocomplete and trends do not count as indexed", () => {
  const seen = judgeSearch({ suggest: true, trends: true, dataForSeoConfigured: false, dataForSeo: null });
  assert.equal(seen.status, "unknown");
  assert.match(seen.note, /不等于/);
  assert.equal(judgeSearch({ suggest: false, trends: false, dataForSeoConfigured: false, dataForSeo: null }).status, "unknown");
  assert.equal(judgeSearch({ suggest: true, trends: false, dataForSeo: "indexed" }).status, "indexed");
  assert.equal(judgeSearch({ suggest: true, trends: true, dataForSeo: "absent" }).status, "absent");
});

test("reposts and the same promoter do not count as two sources", () => {
  const shared = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [
      { source: "reddit", industry: "ai", at: within(1), url: "https://www.reddit.com/r/MachineLearning/comments/one?utm_source=share", author: "ada", title: "Show HN: HyperFrames edits video" },
      { source: "x", industry: "ai", at: within(2), url: "https://news.ycombinator.com/item?id=1", author: "ada", title: "Show HN: HyperFrames edits video" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(shared.status, "unverified");
  assert.equal(shared.independent < 2, true);
});

test("two independent sources inside 48 hours do not confirm without birth evidence", () => {
  const discussed = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [
      { source: "x", industry: "ai", at: within(4), url: "https://x.com/ann/status/9", author: "ann", title: "trying a new editor" },
      { source: "reddit", industry: "ai", at: within(8), url: "https://www.reddit.com/r/LocalLLaMA/comments/xyz", author: "bob", title: "anyone used this model tool" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(discussed.status, "unverified");
  assert.equal(discussed.independent, 2);
  assert.match(discussed.reason, /诞生/);
  const born = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [
      { source: "x", industry: "ai", at: within(4), url: "https://x.com/ann/status/9", author: "ann", title: "trying a new editor" },
      { source: "reddit", industry: "ai", at: within(8), url: "https://www.reddit.com/r/LocalLLaMA/comments/xyz", author: "bob", title: "anyone used this model tool" },
    ],
    ageEvidence: [{ kind: "repo_created", at: within(20), url: "https://github.com/acme/hyperframes" }],
    now,
    windowHours: 48,
  });
  assert.equal(born.status, "novel");
  assert.equal(born.independent, 2);
  assert.equal(born.industry, "ai");
});

const productionPosts = [
  { source: "bluesky", industry: "ai", at: "2026-11-22T08:27:37Z", url: "https://bsky.app/profile/mahi87.bsky.social/post/3n2v6zzg4ts2m", author: "mahi87.bsky.social", title: "#ClaudeAI #ClaudeCode #GitHubCopilot #CursorAI" },
  { source: "bluesky", industry: "ai", at: "2026-11-23T10:37:06Z", url: "https://bsky.app/profile/khofitech.com/post/3n2xwqis2y22x", author: "khofitech.com", title: "Best AI for Coding in 2026 (Free & Paid Tools Compared)" },
];

test("two bluesky posts do not make known products novel", () => {
  const names = ["ClaudeCode", "Claude Code", "claude-code", "claude_code", "ClaudeAI", "GitHubCopilot", "CursorAI", "CrowdStrike", "DeepSeek", "DevOps", "TechCrunch", "PostgreSQL", "McKinsey", "VentureBeat", "CloudComputing", "OpenSource", "FinTech", "gtavi claudecode"];
  for (const term of names) {
    const verdict = judgeBirth({
      term,
      industries: ["ai"],
      sightings: productionPosts,
      ageEvidence: [{ kind: "domain_registered", at: within(24) }, { kind: "repo_created", at: within(24) }],
      now,
      windowHours: 48,
    });
    assert.notEqual(verdict.status, "novel", term);
    assert.equal(verdict.independent >= 2, true, term);
  }
  assert.equal(judgeBirth({ term: "ClaudeCode", industries: ["ai"], sightings: productionPosts, ageEvidence: [{ kind: "repo_created", at: within(24) }], now, windowHours: 48 }).status, "established");
  assert.equal(judgeBirth({ term: "gtavi claudecode", industries: ["ai"], sightings: productionPosts, ageEvidence: [{ kind: "repo_created", at: within(24) }], now, windowHours: 48 }).status, "unverified");
  assert.equal(judgeBirth({ term: "notes for claude", industries: ["ai"], sightings: productionPosts, now, windowHours: 48 }).status, "unverified");
});

test("an unknown name with the same two posts still needs birth evidence", () => {
  const verdict = judgeBirth({
    term: "ZylphFrames",
    industries: ["ai"],
    sightings: productionPosts,
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
  assert.equal(verdict.independent, 2);
});

test("a counted window stays inside 48 hours when older posts exist", () => {
  const wide = judgeBirth({
    term: "HyperFrames",
    industries: ["devtools"],
    sightings: [
      { source: "bluesky", industry: "devtools", at: within(103), url: "https://bsky.app/profile/ann/post/old", author: "ann", title: "first long note about the tool" },
      { source: "reddit", industry: "devtools", at: within(100), url: "https://www.reddit.com/r/programming/comments/early", author: "bob", title: "separate early thread" },
      { source: "bluesky", industry: "devtools", at: within(1), url: "https://bsky.app/profile/ann/post/new", author: "ann", title: "much later note" },
    ],
    ageEvidence: [{ kind: "repo_created", at: within(10) }],
    now,
    windowHours: 48,
  });
  assert.equal(wide.independent, 2);
  const span = Date.parse(wide.windowEnd || "") - Date.parse(wide.windowStart || "");
  assert.equal(span <= 48 * 3600000, true);
  assert.equal(wide.groups.some((group) => group.urls.includes("https://bsky.app/profile/ann/post/new")), false);
  const apart = judgeBirth({
    term: "HyperFrames",
    industries: ["devtools"],
    sightings: [
      { source: "bluesky", industry: "devtools", at: within(103), url: "https://bsky.app/profile/ann/post/a", author: "ann", title: "only early note" },
      { source: "reddit", industry: "devtools", at: within(1), url: "https://www.reddit.com/r/programming/comments/late", author: "bob", title: "only late thread" },
    ],
    ageEvidence: [{ kind: "repo_created", at: within(5) }],
    now,
    windowHours: 48,
  });
  assert.equal(apart.status, "unverified");
  assert.equal(apart.independent < 2, true);
});

test("independent mentions outside the window do not confirm", () => {
  const verdict = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [
      { source: "x", industry: "ai", at: within(80), url: "https://x.com/ann/status/1", author: "ann", title: "first note" },
      { source: "reddit", industry: "ai", at: within(2), url: "https://www.reddit.com/r/LocalLLaMA/comments/late", author: "bob", title: "later thread" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
});

test("another industry does not supply the second source", () => {
  const verdict = judgeBirth({
    term: "HyperFrames",
    industries: ["ai", "crypto"],
    sightings: [
      { source: "x", industry: "ai", at: within(2), url: "https://x.com/ann/status/2", author: "ann", title: "ai side" },
      { source: "reddit", industry: "crypto", at: within(3), url: "https://www.reddit.com/r/CryptoCurrency/comments/c", author: "bob", title: "token side" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
  assert.equal(verdict.independent < 2, true);
});

test("an old repo creation blocks novelty and a math name is not projected from a new repo", () => {
  const old = judgeBirth({
    term: "PostHog",
    industries: ["devtools"],
    sightings: [
      { source: "github", industry: "devtools", at: within(2), url: "https://github.com/PostHog/posthog", title: "star" },
      { source: "bluesky", industry: "devtools", at: within(3), url: "https://bsky.app/profile/a/post/1", author: "a", title: "posthog again" },
    ],
    ageEvidence: [{ kind: "repo_created", at: "2020-01-23T00:00:00Z", url: "https://github.com/PostHog/posthog" }],
    now,
    windowHours: 48,
  });
  assert.equal(old.status, "unverified");
  assert.match(old.reason, /早于/);
  const math = judgeBirth({
    term: "riemann hypothesis",
    industries: ["devtools"],
    sightings: [
      { source: "github", industry: "devtools", at: within(2), url: "https://github.com/leanprover-community/riemann-hypothesis", title: "formalization" },
      { source: "bluesky", industry: "devtools", at: within(3), url: "https://bsky.app/profile/a/post/2", author: "b", title: "hypothesis" },
    ],
    ageEvidence: [{ kind: "repo_created", at: within(10), url: "https://github.com/leanprover-community/riemann-hypothesis" }],
    now,
    windowHours: 48,
  });
  assert.equal(math.status, "unverified");
  assert.match(math.reason, /数学通名/);
});
