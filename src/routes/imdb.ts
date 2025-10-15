import { Router } from 'express';
import { listSaved } from '../services/imdb';

const router = Router();

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
