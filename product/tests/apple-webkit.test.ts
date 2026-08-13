import assert from "node:assert/strict";
import { test } from "node:test";
import { webkit } from "playwright";

test("WebKit can execute the reduced-motion browser contract", async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.setContent("<button id='publish'>Published</button>");
    assert.equal(await page.locator("#publish").textContent(), "Published");
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await context.close();
  } finally {
    await browser.close();
  }
});
