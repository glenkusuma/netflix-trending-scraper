/**
 * Lightweight client for https://api.imdbapi.dev
 *
 * Config via env:
 * - IMDBAPI_BASE_URL (default: https://api.imdbapi.dev)
 * - IMDBAPI_API_KEY (optional)
 * - IMDBAPI_AUTH_STYLE (optional: 'header' | 'query'; if 'header' uses Authorization: Bearer <key>, if 'query' appends ?apiKey=<key>)
 */

type FetchInit = Parameters<typeof fetch>[1];

const BASE_URL = process.env.IMDBAPI_BASE_URL || 'https://api.imdbapi.dev';
const API_KEY = process.env.IMDBAPI_API_KEY || '';
const AUTH_STYLE = (process.env.IMDBAPI_AUTH_STYLE || '').toLowerCase();

function buildUrl(pathname: string, params?: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(pathname.replace(/^\//, ''), BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  // Optional API key handling
  if (API_KEY && AUTH_STYLE === 'query') {
    url.searchParams.set('apiKey', API_KEY);
  }
  return url.toString();
}

async function httpGet<T>(pathname: string, params?: Record<string, any>, init?: FetchInit): Promise<T> {
  const url = buildUrl(pathname, params);
  console.info(`[imdbapi] GET ${url}`);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (API_KEY && AUTH_STYLE === 'header') {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  const res = await fetch(url, { method: 'GET', headers, ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IMDbAPI GET ${pathname} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

// Minimal response types for ergonomics
type ImdbTitle = {
  id: string;
  type?: string;
  primaryTitle?: string;
  originalTitle?: string;
  runtimeSeconds?: number;
  genres?: string[];
  rating?: { aggregateRating?: number; voteCount?: number };
  primaryImage?: { url?: string; width?: number; height?: number; type?: string };
  plot?: string;
};

type SearchTitlesResponse = {
  titles?: ImdbTitle[];
};

async function searchTitles(query: string, limit?: number): Promise<SearchTitlesResponse> {
  if (!query || !query.trim()) throw new Error('query is required');
  return httpGet<SearchTitlesResponse>('/search/titles', { query, limit });
}

async function getTitleById(titleId: string): Promise<ImdbTitle> {
  if (!/^tt\d{5,10}$/i.test(titleId)) throw new Error('titleId must look like tt1234567');
  return httpGet<ImdbTitle>(`/titles/${titleId}`);
}

async function batchGetTitles(titleIds: string[]): Promise<{ titles?: ImdbTitle[] }> {
  if (!Array.isArray(titleIds) || titleIds.length === 0) throw new Error('titleIds required');
  // API expects max 5 IDs; callers should obey this
  const params = new URLSearchParams();
  for (const id of titleIds) params.append('titleIds', id);
  const url = buildUrl('/titles:batchGet');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (API_KEY && AUTH_STYLE === 'header') headers['Authorization'] = `Bearer ${API_KEY}`;
  const fullUrl = `${url}?${params.toString()}`;
  console.info(`[imdbapi] GET ${fullUrl}`);
  const res = await fetch(fullUrl);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`IMDbAPI batchGet failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as { titles?: ImdbTitle[] };
}

export = { searchTitles, getTitleById, batchGetTitles };
