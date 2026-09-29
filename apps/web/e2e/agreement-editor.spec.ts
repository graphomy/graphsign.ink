import { test, expect } from '@playwright/test';
test('full-page editor preserves the originating tab and search context', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('graphsign_session_token', 'browser-test'));
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    await route.fulfill({
      json: url.endsWith('/agreements/draft-browser')
        ? {
            id: 'draft-browser',
            title: 'Browser draft',
            markdownContent: '# Agreement\nTest terms',
            version: '0.1',
            status: 'DRAFT',
            tags: [],
          }
        : { sessionTimeoutMinutes: 15 },
    });
  });
  await page.goto(
    '/agreements/edit?id=draft-browser&returnTo=' +
      encodeURIComponent('/agreements?tab=active&q=contract'),
  );
  await expect(page.getByText('Finalize & make ready for signing', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to agreements' })).toHaveAttribute(
    'href',
    '/agreements?tab=active&q=contract',
  );
  await expect(page.getByRole('button', { name: /Save Draft/ })).toBeVisible();
});
