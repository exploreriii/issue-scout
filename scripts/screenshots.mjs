// Capture README screenshots from a running dev server.
// Usage: node scripts/screenshots.mjs [baseUrl] [handle]   (default http://localhost:8787, exploreriii)
// Requires: `pnpm --filter @issue-scout/ui exec playwright install chromium`
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(new URL("../ui/package.json", import.meta.url))("playwright");

const base = process.argv[2] ?? "http://localhost:8787";
const handle = process.argv[3] ?? "exploreriii";
const out = "docs/screenshots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const shot = async (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: false });

for (const scheme of ["light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await shot(page, `01-landing-${scheme}`);

  const input = page.getByRole("textbox").first();
  await input.fill(handle);
  await page.getByRole("button", { name: /find|scout|search|go/i }).first().click();
  await page.getByRole("article").first().waitFor({ timeout: 90_000 }).catch(() => page.locator("[data-issue], .issue-card, li").first().waitFor({ timeout: 90_000 }));
  await page.waitForTimeout(2500); // let explanations arrive
  await shot(page, `02-shortlist-${scheme}`);
  const card = page.getByRole("article").first();
  if (await card.count()) await card.screenshot({ path: `${out}/05-card-${scheme}.png` });

  const chat = page.getByPlaceholder(/refine|only rust/i).first();
  if (await chat.count()) {
    await chat.fill("only Rust");
    await chat.press("Enter");
    await page.getByText(/thinking/i).first().waitFor({ state: "hidden", timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, `03-refine-${scheme}`);
  }

  // mobile landing
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, deviceScaleFactor: 2, isMobile: true });
  const mp = await mobile.newPage();
  await mp.goto(base, { waitUntil: "networkidle" });
  await shot(mp, `04-mobile-${scheme}`);
  await mobile.close();
  await ctx.close();
}
await browser.close();
console.log(`screenshots written to ${out}/`);
