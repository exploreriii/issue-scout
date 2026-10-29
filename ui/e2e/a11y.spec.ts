import { test, expect, chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";
import { fixture } from "../test/fixture";

const hasBrowser = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

test.skip(
  !hasBrowser,
  "Skipping a11y e2e: no Playwright Chromium installed. Run `npx playwright install chromium` to enable it.",
);

test("built page has zero axe violations (empty and with results)", async ({ page }) => {
  await page.route("**/scout", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }),
  );

  await page.goto("/");
  let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);

  await page.getByLabel("GitHub handle").fill("octocat");
  await page.getByRole("button", { name: "Find issues" }).click();
  await expect(page.getByRole("heading", { name: "Your shortlist" })).toBeVisible();
  await page.getByText("Five more, and why they ranked lower").click();

  results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
});
