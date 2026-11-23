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
  assert.match(verdict.note, /未知|不能写成未收录/);
  assert.equal(judgeSearch({ suggest: null, trends: null, dataForSeo: "error" }).status, "unknown");
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

test("two independent sources inside 48 hours can confirm a focused term", () => {
  const verdict = judgeBirth({
    term: "HyperFrames",
    industries: ["ai"],
    sightings: [
      { source: "x", industry: "ai", at: within(4), url: "https://x.com/ann/status/9", author: "ann", title: "trying a new editor" },
      { source: "reddit", industry: "ai", at: within(8), url: "https://www.reddit.com/r/LocalLLaMA/comments/xyz", author: "bob", title: "anyone used this model tool" },
    ],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "novel");
  assert.equal(verdict.independent, 2);
  assert.equal(verdict.industry, "ai");
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
