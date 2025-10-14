import { Router } from 'express';
import { getTitle, listSaved, saveTitleById, searchTitles } from '../services/imdb';

const router = Router();

router.get('/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const data = await searchTitles(q, limit);
    res.json(data);
  } catch (err) {
    console.error('IMDb search failed:', err);
    res.status(500).json({ error: 'IMDb search failed', details: String(err) });
  }
});

router.get('/titles/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await getTitle(id);
    res.json(data);
  } catch (err) {
    console.error('IMDb getTitle failed:', err);
    res.status(500).json({ error: 'IMDb getTitle failed', details: String(err) });
  }
});

router.post('/titles/:id/save', async (req, res) => {
  try {
    const id = req.params.id;
    const out = await saveTitleById(id);
    res.json(out);
  } catch (err) {
    console.error('Save IMDb title failed:', err);
    res.status(500).json({ error: 'Save IMDb title failed', details: String(err) });
  }
});

router.get('/saved', async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 20)));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const params: any = { take };
    if (cursor) params.cursor = cursor;
    const result = await listSaved(params);
    res.json(result);
  } catch (err) {
    console.error('List saved IMDb titles failed:', err);
    res.status(500).json({ error: 'List saved IMDb titles failed', details: String(err) });
  }
});

export default router;
