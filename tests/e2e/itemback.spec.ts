import { expect, test, type Page } from '@playwright/test';

async function expectDesignBaseline(page: Page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const overflow = root.scrollWidth - root.clientWidth;
    const crowdedRegions = Array.from(
      document.querySelectorAll('.page-header, .form-actions, .panel-heading'),
    )
      .filter((region) => {
        const visiblePrimaryActions = Array.from(
          region.querySelectorAll<HTMLElement>('.button.primary'),
        ).filter((action) => action.getClientRects().length > 0);
        return visiblePrimaryActions.length > 1;
      })
      .map((region) => region.className);

    return { overflow, crowdedRegions };
  });

  expect(result.overflow, '页面不应产生横向溢出').toBeLessThanOrEqual(1);
  expect(result.crowdedRegions, '同一区域不应出现多个主要操作').toEqual([]);
}

test('核心用户流：登录、创建、嵌套、成本、附件、移动与搜索', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.includes('mobile') ? '窄屏' : '桌面';
  const homeName = `验收家-${suffix}`;
  const officeName = `验收公司-${suffix}`;
  const bagName = `验收书包-${suffix}`;
  const bookName = `验收书-${suffix}`;

  await page.goto('/login');
  await expectDesignBaseline(page);
  await page.getByLabel('邮箱').fill('admin@itemback.test');
  await page.getByLabel('密码').fill('itemback-test-password');
  await page.getByRole('button', { name: /进入 ItemBack/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '你的物品，仍在时间里' })).toBeVisible();
  await expectDesignBaseline(page);

  await page.goto('/spaces/new');
  await expectDesignBaseline(page);
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
  await expectDesignBaseline(page);
  await page.getByLabel('物品名称').fill(bagName);
  await page.getByRole('button', { name: /这是一个普通物品/ }).click();
  const acquired = new Date();
  acquired.setUTCDate(acquired.getUTCDate() - 59);
  await page.getByLabel('入手日期', { exact: true }).fill(acquired.toISOString().slice(0, 10));
  await page.getByLabel('记录价值').fill('600');
  await page.getByLabel('币种').fill('CNY');
  await page.getByLabel('品牌中文名或常用名（可选）').fill('爱马仕');
  await page.getByLabel('品牌英文名（可选）').fill('Hermès');
  await page.getByRole('button', { name: '加入档案' }).click();
  await expect(page.getByRole('heading', { name: bagName })).toBeVisible();
  await expect(page.getByText(/10\.0000.*天/)).toBeVisible();
  await expect(page.getByText('Hermès', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /放入物品/ }).click();
  await page.getByLabel('物品名称').fill(bookName);
  const acquiredDateField = page.getByLabel('入手日期', { exact: true }).locator('..');
  await acquiredDateField.getByText('按年份快速定位').click();
  await acquiredDateField.getByLabel('入手日期年份').fill('2012');
  await acquiredDateField.getByLabel('入手日期月份').selectOption('03');
  await acquiredDateField.getByLabel('入手日期日期').selectOption('04');
  await acquiredDateField.getByRole('button', { name: '使用这个日期' }).click();
  await expect(page.getByLabel('入手日期', { exact: true })).toHaveValue('2012-03-04');
  await page.getByRole('button', { name: '加入档案' }).click();
  await expect(page.getByRole('heading', { name: bookName })).toBeVisible();
  await expect(page.getByText('未记录价值', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('2012年3月4日', { exact: true })).toBeVisible();
  await expectDesignBaseline(page);

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('.quick-camera-row input[type=file]').setInputFiles({
    name: 'camera-photo.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.getByText('照片已自动上传。')).toBeVisible();
  await expect(page.locator('.attachments-grid article')).toHaveCount(1);
  await expect(page.locator('.record-glyph img')).toBeVisible();
  await expect(page.locator('.record-glyph svg')).toHaveCount(0);
  await expect(page.locator('.record-glyph img')).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('.record-glyph.has-image')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.getByLabel('管理 camera-photo.png').click();
  await page.getByRole('button', { name: '移除背景', exact: true }).click();
  await expect(page.getByText('当前部署未配置 macOS 本地系统抠图助手').first()).toBeVisible();
  await page.getByLabel('管理 camera-photo.png').click();
  await expect(page.getByRole('button', { name: '重试移除背景' })).toBeVisible();

  await page.locator('.drop-zone input[type=file]').setInputFiles([
    { name: 'book-front.png', mimeType: 'image/png', buffer: png },
    { name: 'book-back.png', mimeType: 'image/png', buffer: png },
    { name: 'manual.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 e2e') },
    { name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('PK e2e') },
  ]);
  await page.getByRole('button', { name: '上传 4 个文件' }).click();
  await expect(page.getByText('附件已安全保存。')).toBeVisible();
  await expect(page.locator('.attachments-grid article')).toHaveCount(5);
  await expect(page.locator('.attachment-preview img')).toHaveCount(3);
  await expect(page.locator('.attachment-preview img').first()).toHaveCSS('object-fit', 'contain');
  const backPhoto = page.locator('.attachments-grid article').filter({ hasText: 'book-back.png' });
  await backPhoto.getByLabel('管理 book-back.png').click();
  await backPhoto.getByRole('button', { name: '设为预览图' }).click();
  await expect(page.getByText('已将“book-back.png”设为预览图。')).toBeVisible();
  await backPhoto.getByLabel('管理 book-back.png').click();
  await expect(backPhoto.getByRole('button', { name: '当前预览图' })).toBeVisible();
  await backPhoto.getByLabel('管理 book-back.png').click();

  const manual = page.locator('.attachments-grid article').filter({ hasText: 'manual.pdf' });
  await manual.getByLabel('管理 manual.pdf').click();
  await manual.getByRole('button', { name: '重命名' }).click();
  await page.getByLabel('文件名').fill('维护手册.pdf');
  await page.getByRole('button', { name: '保存名称' }).click();
  await expect(page.getByText('附件已重命名为“维护手册.pdf”。')).toBeVisible();
  await expect(page.getByText('维护手册.pdf', { exact: true })).toBeVisible();

  const frontPhoto = page
    .locator('.attachments-grid article')
    .filter({ hasText: 'book-front.png' });
  await frontPhoto.getByLabel('管理 book-front.png').click();
  await frontPhoto.getByRole('button', { name: '旋转与裁剪' }).click();
  await page.getByRole('button', { name: '向右旋转' }).click();
  await page.getByRole('button', { name: '方形' }).click();
  await page.getByRole('button', { name: '保存新图片' }).click();
  await expect(page.getByText('book-front-已编辑.png', { exact: true })).toBeVisible();
  await expect(page.locator('.attachments-grid article')).toHaveCount(6);

  await page.getByRole('button', { name: '移动' }).click();
  await page.getByLabel('新位置').selectOption({ label: officeName });
  await page.getByLabel('移动备注（可选）').fill('端到端验收移动');
  await page.getByRole('button', { name: '确认移动' }).click();
  await expect(page.getByText('位置已更新，移动历史已记录。')).toBeVisible();
  await expect(page.getByText(officeName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('端到端验收移动')).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent(bookName)}`);
  await expect(page.getByText('找到 1 件相关物品')).toBeVisible();
  await expect(page.getByText(officeName, { exact: true })).toBeVisible();
  await expectDesignBaseline(page);
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
