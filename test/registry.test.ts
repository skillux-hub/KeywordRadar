import assert from "node:assert/strict";
import test from "node:test";
import { industriesFromEvidence } from "../lib/industries.ts";
import { isPublicHttpUrl } from "../lib/http.ts";
import { freshAfterBaseline, githubCreatedSearch, packageBirth, showHnParts } from "../lib/collectors/registry-rules.ts";
import { judgeBirth } from "../lib/novelty.ts";

const now = Date.parse("2026-11-23T12:00:00Z");

test("a package update is not a new package", () => {
  const birth = packageBirth({ created: "2020-11-26T19:08:27.560Z", modified: "2026-11-23T19:07:01.177Z", now });
  assert.equal(birth.fresh, false);
  assert.match(birth.reason, /更新/);
  const young = packageBirth({ created: "2026-11-20T00:00:00Z", modified: "2026-11-23T00:00:00Z", now });
  assert.equal(young.fresh, true);
  assert.equal(young.at, "2026-11-20T00:00:00.000Z");
});

test("the first baseline does not emit historical ids", () => {
  const first = freshAfterBaseline(new Set(), ["a", "b"], false);
  assert.deepEqual(first.fresh, []);
  assert.equal(first.baselined, true);
  const next = freshAfterBaseline(first.nextSeen, ["b", "c"], true);
  assert.deepEqual(next.fresh, ["c"]);
});

test("github search is the created-time API", () => {
  const url = githubCreatedSearch(now);
  assert.match(url, /sort=created/);
  assert.match(url, /created%3A/);
  assert.doesNotMatch(url, /trending/);
});

test("show hn keeps the product name and the created context", () => {
  const parts = showHnParts("Show HN: RecordHTML – Record HTML animations to video");
  assert.equal(parts.name, "RecordHTML");
  assert.match(parts.context, /animations/);
});

test("industry comes from the bound description, not a hashtag roundup or the bare name", () => {
  const fromContext = industriesFromEvidence([
    { kind: "entity", title: "TokenEconomizer", quote: "A CLI that cuts token spend for LLM agents" },
  ]);
  assert.equal(fromContext.includes("devtools") || fromContext.includes("ai"), true);
  const fromRoundup = industriesFromEvidence([
    { kind: "hashtag", title: "ClaudeCode", quote: "Best AI for Coding #ClaudeCode #CursorAI" },
  ]);
  assert.deepEqual(fromRoundup, []);
});

test("a name without context stays pending instead of being declared out of industry", () => {
  const verdict = judgeBirth({
    term: "TokenEconomizer",
    industries: [],
    sightings: [
      { source: "x", industry: "ai", at: "2026-11-23T08:00:00Z", url: "https://x.com/a/status/1", author: "ann", title: "trying this cli" },
      { source: "reddit", industry: "ai", at: "2026-11-23T09:00:00Z", url: "https://www.reddit.com/r/SideProject/comments/1", author: "bob", title: "anyone used the new release" },
    ],
    ageEvidence: [{ kind: "repo_created", at: "2026-11-22T00:00:00Z" }],
    now,
    windowHours: 48,
  });
  assert.equal(verdict.status, "unverified");
  assert.match(verdict.reason, /待定/);
});

test("public fetch urls reject loopback and non-http", () => {
  assert.equal(isPublicHttpUrl("https://pypi.org/rss/packages.xml"), true);
  assert.equal(isPublicHttpUrl("http://127.0.0.1/secret"), false);
  assert.equal(isPublicHttpUrl("http://169.254.169.254/latest"), false);
  assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
});
