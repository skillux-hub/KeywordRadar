import assert from "node:assert/strict";
import test from "node:test";
import { historyTarget, readGithubCreated, readPypiCreated } from "../lib/history.ts";

test("history lookups stay on stored github and pypi urls", () => {
  const repo = historyTarget("https://github.com/PostHog/posthog");
  assert.equal(repo?.api, "https://api.github.com/repos/PostHog/posthog");
  assert.equal(historyTarget("https://github.com/PostHog/posthog/issues/1"), null);
  assert.equal(historyTarget("https://evil.example/github.com/PostHog/posthog"), null);
  assert.equal(historyTarget("http://127.0.0.1/repos/a/b"), null);
  assert.equal(historyTarget("https://api.github.com/repos/PostHog/posthog"), null);
  const pypi = historyTarget("https://pypi.org/project/codescope-ai/");
  assert.equal(pypi?.api, "https://pypi.org/pypi/codescope-ai/json");
  assert.equal(historyTarget("https://pypi.org/search/?q=codescope"), null);
});

test("github created_at is kept and pushed_at is not a creation time", () => {
  assert.equal(readGithubCreated({ created_at: "2020-01-23T00:00:00Z", pushed_at: "2026-11-23T00:00:00Z" }), "2020-01-23T00:00:00Z");
  assert.equal(readGithubCreated({ pushed_at: "2026-11-23T00:00:00Z" }), null);
  assert.equal(readPypiCreated({
    releases: {
      "1.2.0": [{ upload_time_iso_8601: "2026-11-23T19:00:00Z" }],
      "0.1.0": [{ upload_time_iso_8601: "2024-01-02T00:00:00Z" }],
    },
  }), "2024-01-02T00:00:00Z");
  assert.equal(readPypiCreated({ releases: {} }), null);
});
