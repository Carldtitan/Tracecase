import assert from "node:assert/strict";
import { test } from "node:test";
import { addedLines, shouldReviewPullRequest } from "../lib/tracecase/code-review";

test("code review accepts actionable pull request webhook actions", () => {
  assert.equal(shouldReviewPullRequest({ action: "opened", number: 7, installation: { id: 42 } }), true);
  assert.equal(shouldReviewPullRequest({ action: "closed", number: 7, installation: { id: 42 } }), false);
});

test("inline review comments are restricted to added right-side lines", () => {
  const lines = addedLines("@@ -10,3 +10,4 @@\n context\n-old\n+new\n+extra\n context");
  assert.deepEqual([...lines], [11, 12]);
});
