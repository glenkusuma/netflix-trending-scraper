import { Router } from 'express';
import { listSnapshots, scrapeAndSaveSnapshot, scrapeTop10 } from '../services/netflix';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    endpoints: {
      scrape_preview: 'GET /netflix/top10?country=Global&category=movies_en',
      scrape_and_save: 'POST /netflix/scrape { country, category, useSample, timeoutMs }',
      list_snapshots: 'GET /netflix/snapshots?country=Global&category=movies_en&take=20&cursor=...',
    },
  });
});

router.get('/top10', async (req, res) => {
  try {
    const useSample = req.query.sample === '1' || req.query.sample === 'true';
    const country = typeof req.query.country === 'string' ? req.query.country : 'Global';
    const category = (
      typeof req.query.category === 'string' ? req.query.category : 'movies_en'
    ) as any;
    const result = await scrapeTop10({ useSample, country, category });
    res.json(result);
  } catch (err) {
    console.error('Netflix top10 scrape failed:', err);
    res.status(500).json({ error: 'Scrape failed', details: String(err) });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const body = req.body || {};
    const useSample = !!body.useSample;
    const country = typeof body.country === 'string' ? body.country : 'Global';
    const category = (typeof body.category === 'string' ? body.category : 'movies_en') as any;
    const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;
    const out = await scrapeAndSaveSnapshot({ useSample, country, category, timeoutMs });
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('Netflix scrape+save failed:', err);
    res.status(500).json({ error: 'Netflix scrape+save failed', details: String(err) });
  }
});

router.get('/snapshots', async (req, res) => {
  try {
    const take = Number(req.query.take ?? 20);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const params: any = { take };
    if (cursor) params.cursor = cursor;
    if (country) params.country = country;
    if (category) params.category = category;
    const result = await listSnapshots(params);
    res.json(result);
  } catch (err) {
    console.error('List Netflix snapshots failed:', err);
    res.status(500).json({ error: 'List Netflix snapshots failed', details: String(err) });
  }
});

export default router;
