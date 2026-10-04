/**
 * Styling card — one visual system across all pages.
 * Runs under playwright.hermetic.config.ts (static SPA, hash routing, /api/** mocked).
 */
import { test, expect } from '@playwright/test';
import { mockApi, login } from './spec/_support';

const FEATURE_PAGES: { path: string; testid: string }[] = [
  { path: 'vendor/profile', testid: 'vendor-profile-screen' },
  { path: 'admin/customers', testid: 'admin-customers-screen' },
  { path: 'channels', testid: 'channels-screen' },
  { path: 'orders', testid: 'orders-screen' },
  { path: 'invoices', testid: 'invoices-screen' },
  { path: 'settings/notifications', testid: 'settings-notifications-screen' },
  { path: 'admin/audit-log', testid: 'admin-audit-log-screen' },
];

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await login(page);
});

test('shell: feature pages render inside the shared layout main area', async ({ page }) => {
  for (const p of FEATURE_PAGES) {
    await page.goto(`/#/${p.path}`);
    await expect(page.locator(`main.main-content [data-testid="${p.testid}"]`)).toBeVisible();
    expect(await page.locator(`app-root > [data-testid="${p.testid}"]`).count()).toBe(0);
  }
});

test('shell: sidebar shows Main, Vendor, Customer and Admin nav groups', async ({ page }) => {
  await page.goto('/#/channels');
  const labels = (await page.locator('aside.sidebar .nav-group-label').allTextContents()).map(t => t.trim());
  for (const g of ['Main', 'Vendor', 'Customer', 'Admin']) expect(labels).toContain(g);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`pages: feature pages use token page primitives at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const p of FEATURE_PAGES) {
      await page.goto(`/#/${p.path}`);
      const screen = page.locator(`[data-testid="${p.testid}"].page`);
      await expect(screen).toBeVisible();
      expect(await screen.locator('.card').count()).toBeGreaterThan(0);
      expect(await screen.evaluate(el => getComputedStyle(el).fontFamily)).toContain('Inter');
      const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}
