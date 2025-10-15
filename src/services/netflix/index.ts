import {
  NetflixTop10SnapshotModel,
  type Top10Category,
  type Top10Result,
  type Top10Row,
} from '../../models/netflix';
import { createHash } from 'crypto';
import { getTitle, searchTitles } from '../imdb';
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

  const enrichedImdb = await scrapeTop10WithImdb(result);

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

  // Query IMDb in parallel but stagger each request by 1s per item index to avoid burst-rate
  // (each item waits index * 1000ms before making network calls)
  const enriched = await Promise.all(
    base.data.map(async (row, idx) => {
      // stagger start by index (0 => 0ms, 1 => 1000ms, 2 => 2000ms, ...)
      await new Promise((res) => setTimeout(res, idx * 500));
      try {
        const res = await searchTitles(row.title, imdbLimit);
        const titleId = (res?.titles && res.titles[0]?.id) || null;

        const imdbDetail = titleId ? await getTitle(titleId) : null;

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

  const idInputNetflixImdb = `netflix_imdb|${result.meta.sourceUrl || ''}`;
  const stableIdNetflixImdb = createHash('sha1').update(idInputNetflixImdb).digest('hex');

  const netflixImdb = await NetflixImdbModel.findByIdAndUpdate(
    stableIdNetflixImdb,
    { $set: { _id: stableIdNetflixImdb, ...doc } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

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
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { scrapeTop10, scrapeAndSaveSnapshot, listSnapshots, scrapeTop10WithImdb };
