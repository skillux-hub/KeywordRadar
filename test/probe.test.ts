import assert from "node:assert/strict";
import test from "node:test";
import { capCursor, parseProbe } from "../lib/probe.ts";

test("probe whitelist rejects addresses and unknown sources", () => {
  assert.equal("error" in parseProbe({ source: "github", url: "https://example.com" }), true);
  assert.equal("error" in parseProbe({ source: "reddit" }), true);
  assert.equal("error" in parseProbe({ command: "ls", source: "pypi" }), true);
  const github = parseProbe({ source: "github", maxItems: 100, budgetMs: 1, dryRun: true });
  assert.equal("error" in github, false);
  if (!("error" in github)) {
    assert.equal(github.maxItems, 20);
    assert.equal(github.budgetMs, 5000);
    assert.equal(github.dryRun, true);
    assert.equal(github.source, "github");
  }
});

test("a limited emit does not mark the rest of the window as seen", () => {
  const first = capCursor(["a", "b", "c", "d"], ["c", "d"], 1, true);
  assert.deepEqual(first.emitIds, ["c"]);
  assert.equal(first.nextCursor.includes("d"), false);
  assert.equal(first.nextCursor.includes("a"), true);
  const baseline = capCursor(["a", "b"], ["a"], 1, false);
  assert.deepEqual(baseline.emitIds, []);
  assert.deepEqual(baseline.nextCursor, ["a", "b"]);
});
