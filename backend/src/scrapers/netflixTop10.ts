import puppeteer = require('puppeteer');
import fs = require('fs');
import path = require('path');

/**
 * TODO (deferred work for netflixTop10.ts)
 * - Define MongoDB schema for Netflix Top 10 snapshots (see TODO.netflixTop10.md)
 * - Add POST /netflix-top10/scrape to persist a snapshot (meta + data[]) into MongoDB via Prisma
 * - Add GET /netflix-top10 to query snapshots by country/category/date with pagination
 * - Improve filter application: reliably set both country and category on live Tudum page (currently falls back to Global in some cases)
 * - Add cookie/region banner handling for live page navigation
 * - Add robust selector fallbacks/metrics when DOM changes (alert/log when zero rows)
 * - Telemetry: durations, rows scraped, and error details
 */

type Top10Category = 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en';

type Top10Row = {
  rank: number;
  title: string;
  weeksInTop10: number | null;
  views: { raw: string | null; value: number | null };
  runtime: { raw: string | null; minutes: number | null };
  hoursViewed: { raw: string | null; value: number | null };
};

type Top10Result = {
  meta: {
    sourceUrl: string;
    country: string;
    category: Top10Category;
    categoryLabel: string;
    timeWindowRaw: string | null;
    length: number;
    scrapedAt: string;
  };
  data: Top10Row[];
};

const CategoryLabelMap: Record<Top10Category, string> = {
  movies_en: 'Movies | English',
  movies_non_en: 'Movies | Non-English',
  shows_en: 'Shows | English',
  shows_non_en: 'Shows | Non-English',
};

function parseNumberDotsAware(input: string | null | undefined): number | null {
  if (!input) return null;
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return null;
  try {
    return parseInt(digits, 10);
  } catch {
    return null;
  }
}

function parseRuntimeToMinutes(runtime: string | null | undefined): number | null {
  if (!runtime) return null;
  const m = runtime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1] as string, 10);
  const minutes = parseInt(m[2] as string, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

async function applyFilters(page: puppeteer.Page, country: string, categoryLabel: string) {
  try {
    await page.waitForSelector('[data-uia="top10-country-select"] .selected', { timeout: 10_000 });
    await page.click('[data-uia="top10-country-select"] .selected');
    await page.waitForSelector('[data-uia="top10-country-select-option"]', { timeout: 10_000 });
    await page.evaluate((countryName) => {
      const options = Array.from(document.querySelectorAll('[data-uia="top10-country-select-option"]')) as HTMLElement[];
      const opt = options.find((o) => o.innerText.trim().toLowerCase() === countryName.trim().toLowerCase());
      opt?.click();
    }, country);
  } catch {}

  try {
    await page.waitForSelector('[data-uia="top10-category-select"] .selected', { timeout: 10_000 });
    await page.click('[data-uia="top10-category-select"] .selected');
    await page.waitForSelector('[data-uia="top10-category-select-option"]', { timeout: 10_000 });
    await page.evaluate((label) => {
      const options = Array.from(document.querySelectorAll('[data-uia="top10-category-select-option"]')) as HTMLElement[];
      const opt = options.find((o) => o.innerText.trim() === label.trim());
      opt?.click();
    }, categoryLabel);
  } catch {}

  // Small delay allowing the table to refresh
  await new Promise((r) => setTimeout(r, 1500));
}

async function scrapeNetflixTop10(
  url = 'https://www.netflix.com/tudum/top10',
  opts?: { useSample?: boolean; samplePath?: string; country?: string; category?: Top10Category; timeoutMs?: number }
): Promise<Top10Result> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(opts?.timeoutMs ?? 60_000);
    const useSample = opts?.useSample || process.env.USE_NETFLIX_SAMPLE === '1' || process.env.USE_NETFLIX_SAMPLE?.toLowerCase() === 'true';
    const country = (opts?.country || 'Global').trim();
    const category = opts?.category || 'movies_en';
    const categoryLabel = CategoryLabelMap[category];

    if (useSample) {
      const samplePath = opts?.samplePath || process.env.NETFLIX_SAMPLE_PATH || path.join(process.cwd(), 'sample', 'tudum-top-10-global-table.html');
      const html = fs.readFileSync(samplePath, 'utf-8');
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await applyFilters(page, country, categoryLabel);
    }

    await page.waitForSelector('[data-uia="top10-table"] table tbody tr', { timeout: opts?.timeoutMs ?? 60_000 });

    const timeWindowRaw = await page
      .$eval('[data-uia="section-eyebrow-heading"]', (el) => (el as HTMLElement).innerText.trim())
      .catch(() => null);

    const data = await page.$$eval('[data-uia="top10-table"] table tbody tr', (trs) => {
      const parseText = (el: Element | null) => (el ? (el as HTMLElement).innerText.trim() : '');

      return trs.map((tr) => {
        const titleCell = tr.querySelector('td.title[data-uia="top10-table-row-title"]');
        const rankRaw = parseText((titleCell?.querySelector('.rank') as Element) ?? null);
        const title = parseText((titleCell?.querySelector('button') as Element) ?? null);
        const weeksRaw = parseText(tr.querySelector('[data-uia="top10-table-row-weeks"]'));
        const viewsRaw = parseText(tr.querySelector('[data-uia="top10-table-row-views"]'));
        const runtimeRaw = parseText(tr.querySelector('[data-uia="top10-table-row-runtime"]'));
        const hoursRaw = parseText(tr.querySelector('[data-uia="top10-table-row-hours"]'));

        return { rankRaw, title, weeksRaw, viewsRaw, runtimeRaw, hoursRaw } as any;
      });
    });

    const normalized: Top10Row[] = (data as any[]).map((r) => ({
      rank: parseInt((r.rankRaw || '').replace(/[^0-9]/g, ''), 10) || 0,
      title: r.title || '',
      weeksInTop10: parseNumberDotsAware(r.weeksRaw),
      views: { raw: r.viewsRaw || null, value: parseNumberDotsAware(r.viewsRaw) },
      runtime: { raw: r.runtimeRaw || null, minutes: parseRuntimeToMinutes(r.runtimeRaw) },
      hoursViewed: { raw: r.hoursRaw || null, value: parseNumberDotsAware(r.hoursRaw) },
    }));

    const result: Top10Result = {
      meta: {
        sourceUrl: url,
        country,
        category,
        categoryLabel,
        timeWindowRaw,
        length: normalized.length,
        scrapedAt: new Date().toISOString(),
      },
      data: normalized,
    };

    return result;
  } finally {
    await browser.close();
  }
}

export = scrapeNetflixTop10;
