import { title } from 'process';
import {
  NetflixTop10SnapshotModel,
  type Top10Category,
  type Top10Result,
} from '../../models/netflix';
import { createHash } from 'crypto';

// Scraper exports via `export =` default function
const scrapeNetflixTop10 = require('../../scrapers/netflixTop10') as (
  url?: string,
  opts?: {
    useSample?: boolean;
    samplePath?: string;
    country?: string;
    category?: Top10Category;
    timeoutMs?: number;
  }
) => Promise<Top10Result>;

export type ScrapeOptions = {
  country?: string;
  category?: Top10Category;
  useSample?: boolean;
  timeoutMs?: number;
  samplePath?: string;
};

export async function scrapeTop10(options: ScrapeOptions = {}) {
  const {
    country = 'Global',
    category = 'movies_en',
    useSample = false,
    timeoutMs,
    samplePath,
  } = options;
  // Global-category specific URLs mapping (kept in a typed variable as requested)
  type GlobalCategoryUrlMap = Partial<Record<Top10Category, string>>;
  const GLOBAL_CATEGORY_URL: GlobalCategoryUrlMap = {
    movies_en: 'https://www.netflix.com/tudum/top10',
    movies_non_en: 'https://www.netflix.com/tudum/top10/films-non-english',
    shows_en: 'https://www.netflix.com/tudum/top10/tv',
    shows_non_en: 'https://www.netflix.com/tudum/top10/tv-non-english',
  };

  // Country URL builder (kept as typed values)
  type CountryUrlBuilder = (country: string, category: Top10Category) => string;
  const BASE_URL = 'https://www.netflix.com/tudum/top10' as const;
  const toCountrySlug = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  const buildCountryUrl: CountryUrlBuilder = (c, cat) => {
    const slug = toCountrySlug(c);
    const isShows = String(cat).startsWith('shows');
    return `${BASE_URL}/${slug}${isShows ? '/tv' : ''}`;
  };

  const opts: any = { country, category, useSample };
  if (typeof timeoutMs === 'number') opts.timeoutMs = timeoutMs;
  if (typeof samplePath === 'string') opts.samplePath = samplePath;
  // Determine URL override only for Global (otherwise let the scraper default and use filters)
  const isGlobal = !country || country.trim().toLowerCase() === 'global';
  const urlOverride = isGlobal ? GLOBAL_CATEGORY_URL[category] : buildCountryUrl(country, category);
  const result = await scrapeNetflixTop10(urlOverride, opts);
  return result;
}

export async function scrapeAndSaveSnapshot(options: ScrapeOptions = {}) {
  const result = await scrapeTop10(options);
  // Generate a stable _id from page title and sourceUrl
  const idInput = `${result.meta.title || ''}||${result.meta.sourceUrl || ''}`;
  const stableId = createHash('sha1').update(idInput).digest('hex');

  const doc = {
    _id: stableId,
    fmt: 'html',
    title: result.meta.title,
    sourceUrl: result.meta.sourceUrl,
    global: result.meta.global,
    country: result.meta.country,
    category: result.meta.category,
    timeWindow: result.meta.timeWindow,
    length: result.meta.length,
    scrapedAt: new Date(result.meta.scrapedAt || Date.now()),
    data: result.data,
  } as const;

  // Upsert: create or update existing snapshot by _id
  const snapshot = await NetflixTop10SnapshotModel.findByIdAndUpdate(
    stableId,
    { $set: doc },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return { snapshotId: String(snapshot!._id), meta: result.meta };
}

export async function listSnapshots(params: {
  take?: number;
  cursor?: string;
  country?: string;
  category?: string;
}) {
  const take = Math.min(100, Math.max(1, Number(params.take ?? 20)));
  const q: any = {};
  if (params.country) q.country = params.country;
  if (params.category) q.category = params.category;
  if (params.cursor) q._id = { $lt: params.cursor };

  const items = await NetflixTop10SnapshotModel.find(q).sort({ _id: -1 }).limit(take).lean();
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { scrapeTop10, scrapeAndSaveSnapshot, listSnapshots };
