// Generic helpers used across scrapers/services

export type TimeWindow = {
  type: 'weekly' | 'alltime' | null;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
};

// Parse any numeric value ignoring non-digits. Returns null when no digits are found.
export function parseNumberDotsAware(input: string | null | undefined): number | null {
  if (!input) return null;
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

// Convert runtime in format MM:SS (as seen on Tudum table) into minutes total.
export function parseRuntimeToMinutes(runtime: string | null | undefined): number | null {
  if (!runtime) return null;
  const m = runtime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = parseInt(m[1] as string, 10);
  const minutes = parseInt(m[2] as string, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

// Parse time window text displayed on Tudum (weekly range, all-time, or unknown with year heuristic)
export function parseTimeWindow(raw: string | null): TimeWindow {
  if (!raw) return { type: null, startDate: null, endDate: null, year: null };
  // Right side after optional "Global |" or similar prefix
  const right = (raw.split('|').pop() || raw).trim();

  // Try MM/DD/YY - MM/DD/YY
  const mdy = right.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const toYear = (yy: string) => {
    if (yy.length === 4) return Number(yy);
    const n = Number(yy);
    return n >= 70 ? 1900 + n : 2000 + n;
  };
  const toISODate = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  if (mdy) {
    const y1 = toYear(mdy[3]!);
    const y2 = toYear(mdy[6]!);
    const startDate = toISODate(y1, Number(mdy[1]!), Number(mdy[2]!));
    const endDate = toISODate(y2, Number(mdy[4]!), Number(mdy[5]!));
    return { type: 'weekly', startDate, endDate, year: y2 };
  }

  // Try textual: Month D - Month D, YYYY (e.g., September 29 - October 5, 2025)
  const text = right.match(/([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (text) {
    const mon = (s: string) =>
      [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ].findIndex((m) => s.toLowerCase().startsWith(m)) + 1;
    const y = Number(text[5]!);
    const m1 = mon(text[1]!);
    const d1 = Number(text[2]!);
    const m2 = mon(text[3]!);
    const d2 = Number(text[4]!);
    if (m1 > 0 && m2 > 0) {
      const startDate = toISODate(y, m1, d1);
      const endDate = toISODate(y, m2, d2);
      return { type: 'weekly', startDate, endDate, year: y };
    }
  }

  // All-time view
  if (/all\s*-?\s*time/i.test(right)) {
    return { type: 'alltime', startDate: null, endDate: null, year: null };
  }

  // Fallback: try to extract a year if present
  const yonly = right.match(/(19\d{2}|20\d{2})/);
  return { type: null, startDate: null, endDate: null, year: yonly ? Number(yonly[1]) : null };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
