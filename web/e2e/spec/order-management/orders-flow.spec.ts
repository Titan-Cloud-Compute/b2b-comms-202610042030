import { test, expect } from '@playwright/test';
import { mockApi, login } from '../_support';

test.use({ serviceWorkers: 'block' });

test('orders flow: place and confirm', async ({ page }) => {
  await mockApi(page);

  // In-memory order store overriding the catch-all GET [] from mockApi
  const orders: { id: string; status: string }[] = [];

  await page.route('**/api/orders**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = req.url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    const confirmMatch = url.match(/\/api\/orders\/([^/]+)\/confirm$/);
    if (method === 'PATCH' && confirmMatch) {
      const id = decodeURIComponent(confirmMatch[1]);
      const order = orders.find(o => o.id === id);
      if (order) order.status = 'confirmed';
      return json({ id, status: 'confirmed' });
    }

    if (method === 'GET' && /\/api\/orders$/.test(url)) {
      return json([...orders]);
    }

    if (method === 'POST' && /\/api\/orders$/.test(url)) {
      const body = await req.postDataJSON();
      const order = { id: 'o1', status: 'pending', vendorId: body?.vendorId, customerId: '1' };
      orders.push(order);
      return json(order, 201);
    }

    return route.fallback();
  });

  await login(page);
  await page.goto('/#/orders');
  await expect(page.getByTestId('orders-screen')).toBeVisible();

  // Fill vendor id and item, then submit
  await page.getByTestId('order-vendor-id').fill('vendor-123');
  await page.getByTestId('order-submit').click();

  // Order row should show pending
  await expect(page.getByTestId('order-row').first()).toContainText('pending');

  // Fill delivery date and confirm
  await page.getByTestId('order-delivery-date').first().fill('2026-12-01');
  await page.getByTestId('order-confirm').first().click();

  // Order row should now show confirmed
  await expect(page.getByTestId('order-row').first()).toContainText('confirmed');
});
