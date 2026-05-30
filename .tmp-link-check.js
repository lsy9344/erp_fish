const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);

  await page.goto('http://localhost:3000/login');
  const loginLinks = await page.$$eval('a', (items) => items.map((a) => ({
    text: (a.textContent || '').trim(),
    href: a.getAttribute('href'),
  })));
  console.log('login links:', loginLinks);

  await page.getByLabel('이메일').fill('manager@example.com');
  await page.getByLabel('비밀번호').fill('correct-password');
  await page.getByRole('button', { name: '로그인' }).click();

  await page.waitForURL('**/app/store-entry*');

  const storeLinks = await page.$$eval('a', (items) => items.map((a) => ({
    text: (a.textContent || '').trim(),
    href: a.getAttribute('href'),
  })));
  console.log('store links:', storeLinks);

  for (const text of ['장부', '재고', '손실']) {
    const locator = page.getByRole('link', { name: text });
    if (await locator.count()) {
      const href = await locator.first().getAttribute('href');
      console.log('before click', text, href);
      await locator.first().click({ trial: true });
      console.log('trial click ok:', text);
    } else {
      console.log('not found link:', text);
    }
  }

  await browser.close();
})();
