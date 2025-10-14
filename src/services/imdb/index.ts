import { ImdbTitleModel } from '../../models/imdb';
// Client exports via `export =`
const imdbapi = require('../../clients/imdbapi') as {
  searchTitles: (q: string, limit?: number) => Promise<any>;
  getTitleById: (id: string) => Promise<any>;
  batchGetTitles: (ids: string[]) => Promise<any>;
};

export async function searchTitles(query: string, limit?: number) {
  if (!query || !query.trim()) throw new Error('query is required');
  return imdbapi.searchTitles(query, limit);
}

export async function getTitle(id: string) {
  return imdbapi.getTitleById(id);
}

export async function saveTitleById(id: string) {
  const data = await imdbapi.getTitleById(id);
  await (ImdbTitleModel as any).updateOne({ titleId: id }, { $set: { data } }, { upsert: true });
  const saved = await (ImdbTitleModel as any).findOne({ titleId: id }).lean();
  return { ok: true, titleId: id, _id: saved?._id };
}

export async function listSaved(params: { take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, Number(params.take ?? 20)));
  const cursor = params.cursor;
  const query = cursor ? { _id: { $lt: cursor } } : {};
  const items = await (ImdbTitleModel as any)
    .find(query as any)
    .sort({ _id: -1 })
    .limit(take)
    .lean();
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { searchTitles, getTitle, saveTitleById, listSaved };
