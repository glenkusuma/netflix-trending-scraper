import express = require('express');
import dotenv = require('dotenv');
import morgan = require('morgan');
const imdbapi = require('./clients/imdbapi');
import { connectMongo } from './db';
import { ImdbTitleModel } from './models/imdb';
import { NetflixTop10SnapshotModel } from './models/netflix';

dotenv.config();

const app = express();
app.use(express.json());
// Inbound request logging: log hit and completion timing for every endpoint
app.use((req, res, next) => {
  const start = Date.now();
  // Note: avoid logging sensitive headers/body; keep it minimal
  console.info(`[req] -> ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.info(`[req] <- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});
app.use(morgan('dev'));

// Connect to Mongo on startup and sync indexes
(async () => {
  try {
    await connectMongo();
    await Promise.all([
      ImdbTitleModel.syncIndexes(),
      NetflixTop10SnapshotModel.syncIndexes(),
    ]);
    console.log('[mongo] indexes synced');
  } catch (err) {
    console.error('Mongo initialization failed at startup:', err);
  }
})();

app.get('/', async (_req, res) => {
  res.json({ status: 'ok', message: 'Scraper backend running' });
});

// Netflix module root
app.get('/netflix', (_req, res) => {
  res.json({
    ok: true,
    endpoints: {
      scrape_preview: 'GET /netflix/top10?country=Global&category=movies_en',
      scrape_and_save: 'POST /netflix/scrape { country, category, useSample, timeoutMs }',
      list_snapshots: 'GET /netflix/snapshots?country=Global&category=movies_en&take=20&cursor=...'
    }
  });
});

// Netflix Top 10: scrape and return the rows
app.get('/netflix/top10', async (req, res) => {
  try {
    const scrapeNetflixTop10 = require('./scrapers/netflixTop10') as (
      url?: string,
      opts?: { useSample?: boolean; samplePath?: string; country?: string; category?: 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en'; timeoutMs?: number }
    ) => Promise<any>;

    const useSample = req.query.sample === '1' || req.query.sample === 'true';
    const country = typeof req.query.country === 'string' ? req.query.country : 'Global';
    const category = (typeof req.query.category === 'string' ? req.query.category : 'movies_en') as
      | 'movies_en'
      | 'movies_non_en'
      | 'shows_en'
      | 'shows_non_en';

    const result = await scrapeNetflixTop10(undefined, { useSample, country, category });
    console.log('[netflix] scraped', { country, category, rows: Array.isArray(result?.data) ? result.data.length : 0 });
    res.json(result);
  } catch (err) {
    console.error('Netflix top10 scrape failed:', err);
    res.status(500).json({ error: 'Scrape failed', details: String(err) });
  }
});

// Netflix: scrape and persist a snapshot
app.post('/netflix/scrape', async (req, res) => {
  try {
    const scrapeNetflixTop10 = require('./scrapers/netflixTop10') as (
      url?: string,
      opts?: { useSample?: boolean; samplePath?: string; country?: string; category?: 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en'; timeoutMs?: number }
    ) => Promise<any>;
    const body = req.body || {};
    const useSample = !!body.useSample;
    const country = typeof body.country === 'string' ? body.country : 'Global';
    const category = (typeof body.category === 'string' ? body.category : 'movies_en') as
      | 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en';
    const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;

  const result = await scrapeNetflixTop10(undefined, { useSample, country, category, timeoutMs });
  const snapshot = await (NetflixTop10SnapshotModel).create({
      sourceUrl: result.meta.sourceUrl,
      country: result.meta.country,
      category: result.meta.category,
      categoryLabel: result.meta.categoryLabel,
      timeWindowRaw: result.meta.timeWindowRaw,
      scrapedAt: new Date(result.meta.scrapedAt || Date.now()),
      data: result.data,
    });
    console.log('[netflix] saved snapshot', { id: String(snapshot._id), country, category });
    res.json({ ok: true, snapshotId: String(snapshot._id), meta: result.meta });
  } catch (err) {
    console.error('Netflix scrape+save failed:', err);
    res.status(500).json({ error: 'Netflix scrape+save failed', details: String(err) });
  }
});

// Netflix: list snapshots with optional filters
app.get('/netflix/snapshots', async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 20)));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const q: any = {};
    if (country) q.country = country;
    if (category) q.category = category;
    if (cursor) q._id = { $lt: cursor };
  const items = await (NetflixTop10SnapshotModel).find(q).sort({ _id: -1 }).limit(take).lean();
    const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
    res.json({ items, nextCursor });
  } catch (err) {
    console.error('List Netflix snapshots failed:', err);
    res.status(500).json({ error: 'List Netflix snapshots failed', details: String(err) });
  }
});

// IMDb API passthrough: search titles
app.get('/imdb/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const data = await imdbapi.searchTitles(q, limit);
    res.json(data);
  } catch (err) {
    console.error('IMDb search failed:', err);
    res.status(500).json({ error: 'IMDb search failed', details: String(err) });
  }
});

// IMDb API passthrough: get title by ID
app.get('/imdb/titles/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await imdbapi.getTitleById(id);
    console.log('[imdb] fetched title', { id });
    res.json(data);
  } catch (err) {
    console.error('IMDb getTitle failed:', err);
    res.status(500).json({ error: 'IMDb getTitle failed', details: String(err) });
  }
});

// IMDb: save a title into Mongo (upsert by titleId)
app.post('/imdb/titles/:id/save', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await imdbapi.getTitleById(id);
    await (ImdbTitleModel as any).updateOne(
      { titleId: id },
      { $set: { data } },
      { upsert: true }
    );
  const saved = await (ImdbTitleModel as any).findOne({ titleId: id }).lean();
    res.json({ ok: true, titleId: id, _id: saved?._id });
  } catch (err) {
    console.error('Save IMDb title failed:', err);
    res.status(500).json({ error: 'Save IMDb title failed', details: String(err) });
  }
});

// IMDb: list saved titles (paged)
app.get('/imdb/saved', async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 20)));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const query = cursor ? { _id: { $lt: cursor } } : {};
  const items = await (ImdbTitleModel as any).find(query as any)
      .sort({ _id: -1 })
      .limit(take)
      .lean();
    const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
    res.json({ items, nextCursor });
  } catch (err) {
    console.error('List saved IMDb titles failed:', err);
    res.status(500).json({ error: 'List saved IMDb titles failed', details: String(err) });
  }
});

const port = Number(process.env.SERVER_PORT || 8000);

app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
  // Ready
});
