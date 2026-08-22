import { expect, test } from '@playwright/test';

test('核心用户流：登录、创建、嵌套、成本、附件、移动与搜索', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.includes('mobile') ? '窄屏' : '桌面';
  const homeName = `验收家-${suffix}`;
  const officeName = `验收公司-${suffix}`;
  const bagName = `验收书包-${suffix}`;
  const bookName = `验收书-${suffix}`;

  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@itemback.test');
  await page.getByLabel('密码').fill('itemback-test-password');
  await page.getByRole('button', { name: /进入 ItemBack/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '你的物品，仍在时间里' })).toBeVisible();

  await page.goto('/spaces/new');
  await page.getByLabel('空间名称').fill(homeName);
  await page.getByRole('button', { name: '创建空间' }).click();
  await expect(page.getByRole('heading', { name: homeName, level: 1 })).toBeVisible();
  const homeUrl = page.url();

  await page.goto('/spaces/new');
  await page.getByLabel('空间名称').fill(officeName);
  await page.getByRole('button', { name: '创建空间' }).click();
  await expect(page.getByRole('heading', { name: officeName, level: 1 })).toBeVisible();
  await page.goto(homeUrl);

  await page.getByRole('link', { name: /记录物品/ }).click();
  await page.getByLabel('物品名称').fill(bagName);
  await page.getByRole('button', { name: /这是一个普通物品/ }).click();
  const acquired = new Date();
  acquired.setUTCDate(acquired.getUTCDate() - 59);
  await page.getByLabel('入手日期').fill(acquired.toISOString().slice(0, 10));
  await page.getByLabel('记录价值').fill('600');
  await page.getByLabel('币种').fill('CNY');
  await page.getByRole('button', { name: '加入档案' }).click();
  await expect(page.getByRole('heading', { name: bagName })).toBeVisible();
  await expect(page.getByText(/10\.0000.*天/)).toBeVisible();

  await page.getByRole('link', { name: /放入物品/ }).click();
  await page.getByLabel('物品名称').fill(bookName);
  await page.getByRole('button', { name: '加入档案' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
  await expect(page.getByText('未记录价值', { exact: true }).first()).toBeVisible();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles([
    { name: 'book-front.png', mimeType: 'image/png', buffer: png },
    { name: 'book-back.png', mimeType: 'image/png', buffer: png },
    { name: 'manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') },
    { name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('PK e2e') },
  ]);
  await page.getByRole('button', { name: '上传 4 个文件' }).click();
  await expect(page.getByText('附件已安全保存。')).toBeVisible();
  await expect(page.locator('.attachments-grid article')).toHaveCount(4);
  await expect(page.locator('.attachment-preview img')).toHaveCount(2);

  await page.getByRole('button', { name: '移动' }).click();
  await page.getByLabel('新位置').selectOption({ label: officeName });
  await page.getByLabel('移动备注（可选）').fill('端到端验收移动');
  await page.getByRole('button', { name: '确认移动' }).click();
  await expect(page.getByText('位置已更新，移动历史已记录。')).toBeVisible();
  await expect(page.getByText(officeName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('端到端验收移动')).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(bookName)}`);
  await expect(page.getByText('找到 1 件相关物品')).toBeVisible();
  await expect(page.getByText(`${officeName} / ${bookName}`)).toBeVisible();
  await page.getByRole('link', { name: new RegExp(bookName) }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();

  if (testInfo.project.name.includes('mobile')) {
    await expect(page.locator('.mobile-header')).toBeVisible();
    await expect(page.locator('.record-hero')).toBeVisible();
  }
});

test('未登录不能读取个人物品与附件', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/nodes/tree');
  expect(response.status()).toBe(401);
  expect((await response.json()).code).toBe('AUTH_REQUIRED');
});
