import {
  NetflixTop10SnapshotModel,
  type Top10Category,
  type Top10Result,
  type Top10Row,
} from '../../models/netflix';
import { createHash } from 'crypto';
import { getTitle, searchTitles } from '../imdb';
import logger from '../../helper/logger';
import { NetflixImdbModel } from '../../models/combine';

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
  logger.debug({ country, category, useSample }, 'netflix scrapeTop10 start');
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
  logger.info(
    {
      url: urlOverride,
      rows: Array.isArray((result as any)?.data) ? (result as any).data.length : 0,
      timeWindow: (result as any)?.meta?.timeWindow?.type,
    },
    'netflix scrapeTop10 scraped'
  );

  const enrichedImdb = await scrapeTop10WithImdb(result);
  logger.info(
    {
      rows: Array.isArray((enrichedImdb as any)?.data) ? (enrichedImdb as any).data.length : 0,
    },
    'netflix scrapeTop10 enriched with IMDb'
  );

  return { ...enrichedImdb };
}

/**
 * Scrape Netflix Top 10 and enrich each row with IMDb search result by title.
 * - Does NOT change persistence schema; this is a separate helper from scrapeAndSaveSnapshot.
 * - Adds a new `imdb` property to each data row containing the best matched IMDb title (or null).
 */
export async function scrapeTop10WithImdb(base: Top10Result): Promise<{
  meta: Top10Result['meta'];
  data: Array<Top10Row & { imdb: import('../imdb/clients/imdbapi').ImdbTitle | null }>;
}> {
  const imdbLimit = 1; // Only fetch the top result for enrichment
  logger.debug(
    {
      rows: Array.isArray((base as any)?.data) ? (base as any).data.length : 0,
    },
    'netflix scrapeTop10WithImdb start'
  );

  // Query IMDb in parallel but stagger each request by 1s per item index to avoid burst-rate
  // (each item waits index * 1000ms before making network calls)
  const enriched = await Promise.all(
    base.data.map(async (row, idx) => {
      // stagger start by index (0 => 0ms, 1 => 1000ms, 2 => 2000ms, ...)
      await new Promise((res) => setTimeout(res, idx * 500));
      try {
        logger.debug({ title: row.title }, 'imdb.search start');
        const res = await searchTitles(row.title, imdbLimit);
        const titleId = (res?.titles && res.titles[0]?.id) || null;
        logger.debug({ title: row.title, titleId }, 'imdb.search done');
        const imdbDetail = titleId ? await getTitle(titleId) : null;
        logger.debug({ titleId, ok: !!imdbDetail }, 'imdb.getTitle done');

        return { ...row, imdb: imdbDetail } as Top10Row & {
          imdb: import('../imdb/clients/imdbapi').ImdbTitle | null;
        };
      } catch (err) {
        return { ...row, imdb: null } as Top10Row & {
          imdb: import('../imdb/clients/imdbapi').ImdbTitle | null;
        };
      }
    })
  );

  return { meta: base.meta, data: enriched } as any;
}

export async function scrapeAndSaveSnapshot(options: ScrapeOptions = {}) {
  logger.debug(options, 'netflix scrapeAndSaveSnapshot start');
  const result = await scrapeTop10(options);
  // Generate a stable _id from page title and sourceUrl
  const idInput = `netflix|${result.meta.sourceUrl || ''}`;
  const stableId = createHash('sha1').update(idInput).digest('hex');

  const doc = {
    src: 'netflix',
    fmt: 'html',
    title: result.meta.title,
    sourceUrl: result.meta.sourceUrl,
    global: result.meta.global,
    country: result.meta.country,
    category: result.meta.category,
    timeWindow: result.meta.timeWindow,
    length: result.meta.length,
    scrapedAt: new Date(result.meta.scrapedAt || Date.now()),
    data: result.data.map((r: any) => ({
      rank: r.rank,
      title: r.title,
      weeksInTop10: r.weeksInTop10,
      views: r.views,
      runtimeSecond: r.runtimeSecond,
      hoursViewed: r.hoursViewed,
      type: r.imdb?.data?.type,
      primaryImage: r.imdb?.data?.primaryImage,
      genres: r.imdb?.data?.genres,
      rating: r.imdb?.data?.rating,
      directors: r.imdb?.data?.directors,
      writers: r.imdb?.data?.writers,
      stars: r.imdb?.data?.stars,
      originCountries: r.imdb?.data?.originCountries,
      spokenLanguages: r.imdb?.data?.spokenLanguages,
      interests: r.imdb?.data?.titleInterests,
    })),
  } as const;

  // Upsert: create or update existing snapshot by _id
  const snapshot = await NetflixTop10SnapshotModel.findByIdAndUpdate(
    stableId,
    { $set: { _id: stableId, ...doc } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  logger.info(
    {
      _id: stableId,
      rows: (doc as any)?.data?.length,
      country: (doc as any)?.country,
      category: (doc as any)?.category,
    },
    'netflix snapshot upserted'
  );

  const idInputNetflixImdb = `netflix_imdb|${result.meta.sourceUrl || ''}`;
  const stableIdNetflixImdb = createHash('sha1').update(idInputNetflixImdb).digest('hex');

  const netflixImdb = await NetflixImdbModel.findByIdAndUpdate(
    stableIdNetflixImdb,
    { $set: { _id: stableIdNetflixImdb, ...doc } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  logger.info({ _id: stableIdNetflixImdb }, 'netflix_imdb upserted');

  return {
    netflixTop10Id: String(snapshot!._id),
    meta: result.meta,
  };
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
  logger.debug({ q, take, got: items.length }, 'netflix listSnapshots');
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export async function searchNetflixImdb(params: {
  q?: string;
  take?: number | undefined; // 1..100
  cursor?: string | undefined; // use _id for pagination (exclusive, return items with _id < cursor)
  country?: string | undefined;
  category?: string | undefined;
}) {
  const take = Math.min(100, Math.max(1, Number(params.take ?? 20)));
  const q: any = {};
  if (params.country) q.country = params.country;
  if (params.category) q.category = params.category;
  if (params.cursor) q._id = { $lt: params.cursor };

  // Prefer text search when available. If no q provided, return paged items matching filters.
  const searchQuery = params.q?.trim();
  if (!searchQuery) {
    const items = await NetflixImdbModel.find(q).sort({ _id: -1 }).limit(take).lean();
    const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
    return { items, nextCursor };
  }

  // Try text search first
  try {
    const textFilter = { $text: { $search: searchQuery } } as any;
    const merged = { ...q, ...textFilter };
    const items = await NetflixImdbModel.find(merged, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, _id: -1 })
      .limit(take)
      .lean();
    const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
    return { items, nextCursor };
  } catch (err) {
    logger.debug({ err }, 'text search failed, falling back to regex');
  }

  // Fallback: case-insensitive regex search against title and data.title
  const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const fallbackFilter = {
    $or: [{ title: regex }, { 'data.title': regex }],
    ...q,
  };
  const items = await NetflixImdbModel.find(fallbackFilter).sort({ _id: -1 }).limit(take).lean();
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { scrapeTop10, scrapeAndSaveSnapshot, listSnapshots, scrapeTop10WithImdb };
