type DateValue = string | number | Date | null | undefined;
const pad = (value: number) => String(value).padStart(2, '0');

function utcDate(value: DateValue): Date | null {
 if (value == null || value === '') return null;
 // Calendar inputs contain a UTC wall time without a zone suffix.
 const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
  ? `${value}Z` : value;
 const date = new Date(normalized);
 return Number.isFinite(date.getTime()) ? date : null;
}

export function formatUTCDate(value: DateValue): string {
 const date = utcDate(value);
 return date ? `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${String(date.getUTCFullYear()).padStart(4, '0')}` : 'Not recorded';
}

export function formatUTCTime(value: DateValue, seconds = true): string {
 const date = utcDate(value);
 return date ? `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${seconds ? `:${pad(date.getUTCSeconds())}` : ''}` : 'Not recorded';
}

export function formatUTCDateTime(value: DateValue, seconds = true): string {
 const date = utcDate(value);
 return date ? `${formatUTCDate(date)} ${formatUTCTime(date, seconds)}` : 'Not recorded';
}
