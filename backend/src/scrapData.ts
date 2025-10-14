import puppeteer = require('puppeteer');
const { Cluster } = require('puppeteer-cluster');
const db = require('./db');

const URL = process.env.TARGET_URL || 'https://example.com';

async function insertProducts(products: { title: string; category: string }[]) {
  if (!products.length) return;
  // de-duplicate locally by composite key (title+category)
  const seen = new Set<string>();
  const unique = products.filter((p) => {
    const key = `${p.title}__${p.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  try {
    const result = await db.product.createMany({ data: unique });
    console.log(`${result.count} products inserted.`);
  } catch (error) {
    console.error('Error inserting products:', error);
  }
}

async function scrapData() {
  // Step 1: get categories links using a single browser
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-dev-tools',
      '--single-process',
      '--no-zygote',
    ],
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Example: change these selectors to match your target site
  await page.waitForSelector('#category-menu-button');
  await page.click('#category-menu-button');
  await page.waitForSelector('.menu-categories__link');

  const categoriesLinks: string[] = await page.$$eval(
    '.menu-categories__link',
    (elements) => elements.map((el) => (el as HTMLAnchorElement).href)
  );

  await browser.close();

  // Step 2: parallel scrape each category with puppeteer-cluster
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: Number(process.env.MAX_CONCURRENCY || 4),
    timeout: 5 * 60 * 1000,
    monitor: true,
    puppeteerOptions: {
      headless: 'new',
    },
  });

  const allProducts: Record<string, { title: string; category: string }[]> = {};

  await cluster.task(async ({ page, data: url }: { page: any; data: string }) => {
    await page.setRequestInterception(true);
  page.on('request', (req: any) => {
      if (req.resourceType() === 'image' || req.resourceType() === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(String(url), { waitUntil: 'domcontentloaded' });
    const pageTitle = await page.title();
    let stop = false;
    allProducts[pageTitle] = [];

    while (!stop) {
      await page.waitForSelector('.products-list__item', { timeout: 30_000 }).catch(() => {});

      const productsListItems = await page.$$eval(
        '.product-card__title',
        (elements: Element[], title: string) =>
          elements.map((product: Element) => ({
            title: (product as HTMLElement).innerText.trim(),
            category: String(title),
          })),
        pageTitle as unknown as string
      );

      allProducts[pageTitle] = [...allProducts[pageTitle], ...productsListItems];

      const isEnd = await page.$(
        '.pagination-arrow:not(.pagination-arrow--left).pagination-arrow--disabled'
      );

      if (isEnd) {
        stop = true;
        await insertProducts(allProducts[pageTitle]);
        console.log(`${pageTitle} – completed`);
        return;
      }

      await page.waitForSelector('.pagination-arrow:not(.pagination-arrow--left)', {
        visible: true,
      });
      await page.evaluate(() => {
        const btn = document.querySelector('.pagination-arrow:not(.pagination-arrow--left)');
        (btn as HTMLButtonElement)?.click();
      });
    }
  });

  for (const link of categoriesLinks) {
    await cluster.queue(link);
  }

  await cluster.idle();
  await cluster.close();
}

export = scrapData;
