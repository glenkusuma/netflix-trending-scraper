import puppeteer = require('puppeteer');
import fs = require('fs');
import path = require('path');
import { parseNumberDotsAware, parseRuntimeToMinutes, parseTimeWindow, sleep } from '../helper';

type Top10Category =
  | 'movies_en'
  | 'movies_non_en'
  | 'shows_en'
  | 'shows_non_en'
  | 'shows'
  | 'movies';

type Top10Row = {
  rank: number;
  title: string;
  weeksInTop10: number | null;
  views: number | null;
  runtimeSecond: number | null;
  hoursViewed: number | null;
};

type Top10Result = {
  meta: {
    title: string;
    sourceUrl: string;
    global: boolean;
    country: string | null;
    category: Top10Category;
    timeWindow: {
      type: 'weekly' | 'alltime' | null;
      startDate: string | null;
      endDate: string | null;
      year: number | null;
    };
    length: number;
    scrapedAt: string;
  };
  data: Top10Row[];
};

// -----------------------------
// Constants & Selectors
// -----------------------------

const CATEGORY_LABEL: Partial<Record<Top10Category, string>> = {
  movies_en: 'Movies | English',
  movies_non_en: 'Movies | Non-English',
  shows_en: 'Shows | English',
  shows_non_en: 'Shows | Non-English',
};

const SELECTOR = {
  tableRows: '[data-uia="top10-table"] table tbody tr',
  eyebrow: '[data-uia="section-eyebrow-heading"]',
  countrySelected: '[data-uia="top10-country-select"] .selected',
  countryOption: '[data-uia="top10-country-select-option"]',
  categorySelected: '[data-uia="top10-category-select"] .selected',
  categoryOption: '[data-uia="top10-category-select-option"]',
  // row cells
  row: {
    titleCell: 'td.title[data-uia="top10-table-row-title"]',
    rank: '.rank',
    titleBtn: 'button',
    weeks: '[data-uia="top10-table-row-weeks"]',
    views: '[data-uia="top10-table-row-views"]',
    runtime: '[data-uia="top10-table-row-runtime"]',
    hours: '[data-uia="top10-table-row-hours"]',
  },
} as const;

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
];

// -----------------------------
// Page helpers
// -----------------------------

async function openSource(
  page: puppeteer.Page,
  url: string,
  useSample: boolean,
  samplePath?: string
) {
  if (useSample) {
    const file =
      samplePath ||
      process.env.NETFLIX_SAMPLE_PATH ||
      path.join(process.cwd(), 'sample', 'tudum-top-10-global-table.html');
    console.info(`[netflix] render sample HTML from ${file}`);
    const html = fs.readFileSync(file, 'utf-8');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return;
  }
  console.info(`[netflix] visiting ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

async function applyFilters(page: puppeteer.Page, country: string, categoryLabel?: string) {
  // Country
  try {
    await page.waitForSelector(SELECTOR.countrySelected, { timeout: 10_000 });
    await page.click(SELECTOR.countrySelected);
    await page.waitForSelector(SELECTOR.countryOption, { timeout: 10_000 });
    await page.evaluate(
      ({ name, OPTION }) => {
        const options = Array.from(document.querySelectorAll(OPTION)) as HTMLElement[];
        const opt = options.find(
          (o) => o.innerText.trim().toLowerCase() === name.trim().toLowerCase()
        );
        opt?.click();
      },
      { name: country, OPTION: SELECTOR.countryOption }
    );
  } catch {}

  // Category (optional)
  if (categoryLabel) {
    try {
      await page.waitForSelector(SELECTOR.categorySelected, { timeout: 10_000 });
      await page.click(SELECTOR.categorySelected);
      await page.waitForSelector(SELECTOR.categoryOption, { timeout: 10_000 });
      await page.evaluate(
        ({ label, OPTION }) => {
          const options = Array.from(document.querySelectorAll(OPTION)) as HTMLElement[];
          const opt = options.find((o) => o.innerText.trim() === label.trim());
          opt?.click();
        },
        { label: categoryLabel, OPTION: SELECTOR.categoryOption }
      );
    } catch {}
  }

  // Let table refresh
  await sleep(1500);
}

async function readTimeWindow(page: puppeteer.Page): Promise<ReturnType<typeof parseTimeWindow>> {
  const raw = await page
    .$eval(SELECTOR.eyebrow, (el) => (el as HTMLElement).innerText.trim())
    .catch(() => null);
  return parseTimeWindow(raw);
}

async function readRows(page: puppeteer.Page) {
  return page.$$eval(
    SELECTOR.tableRows,
    (trs, SELECTOR_IN) => {
      const S = SELECTOR_IN as any;
      const tx = (el: Element | null) => (el ? (el as HTMLElement).innerText.trim() : '');
      return trs.map((tr) => {
        const titleCell = tr.querySelector(S.row.titleCell);
        const rankRaw = tx((titleCell?.querySelector(S.row.rank) as Element) ?? null);
        const title = tx((titleCell?.querySelector(S.row.titleBtn) as Element) ?? null);
        const weeksRaw = tx(tr.querySelector(S.row.weeks));
        const viewsRaw = tx(tr.querySelector(S.row.views));
        const runtimeRaw = tx(tr.querySelector(S.row.runtime));
        const hoursRaw = tx(tr.querySelector(S.row.hours));
        return { rankRaw, title, weeksRaw, viewsRaw, runtimeRaw, hoursRaw } as any;
      });
    },
    SELECTOR
  );
}

async function scrapeNetflixTop10(
  url = 'https://www.netflix.com/tudum/top10',
  opts?: {
    useSample?: boolean;
    samplePath?: string;
    country?: string;
    category?: Top10Category;
    timeoutMs?: number;
  }
): Promise<Top10Result> {
  const browser = await puppeteer.launch({ headless: true, args: PUPPETEER_ARGS });
  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(opts?.timeoutMs ?? 60_000);

    // Resolve options with env fallbacks
    const useSample =
      opts?.useSample ||
      process.env.USE_NETFLIX_SAMPLE === '1' ||
      process.env.USE_NETFLIX_SAMPLE?.toLowerCase() === 'true';
    const country = opts?.country && opts.country !== 'Global' ? opts.country.trim() : null;
    const category = opts?.category ?? 'movies_en';
    const categoryLabel = CATEGORY_LABEL[category];

    // Load source
    await openSource(page, url, !!useSample, opts?.samplePath);
    // Read page title for meta
    const pageTitle = (await page.title().catch(() => '')) || 'Netflix Top 10';
    // Apply filters only for live page
    if (!useSample) {
      await applyFilters(page, country ?? 'Global', categoryLabel);
    }

    // Wait rows and read
    await page.waitForSelector(SELECTOR.tableRows, { timeout: opts?.timeoutMs ?? 60_000 });
    const timeWindow = await readTimeWindow(page);
    const data = await readRows(page);

    if (!data.length) {
      console.warn('[netflix] No rows found after filtering - selectors may have changed.');
    }

    const normalized: Top10Row[] = (data as any[]).map((r) => ({
      rank: parseInt((r.rankRaw || '').replace(/[^0-9]/g, ''), 10) || 0,
      title: r.title || '',
      weeksInTop10: parseNumberDotsAware(r.weeksRaw),
      views: parseNumberDotsAware(r.viewsRaw) || null,
      // NOTE: naming kept for backward compatibility even though value is minutes
      runtimeSecond: parseRuntimeToMinutes(r.runtimeRaw) || null,
      hoursViewed: parseNumberDotsAware(r.hoursRaw) || null,
    }));

    return {
      meta: {
        title: pageTitle,
        sourceUrl: url,
        global: !country,
        country,
        category,
        timeWindow,
        length: normalized.length,
        scrapedAt: new Date().toISOString(),
      },
      data: normalized,
    };
  } finally {
    await browser.close();
  }
}

export = scrapeNetflixTop10;
