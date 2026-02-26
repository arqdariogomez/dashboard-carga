import type { DynamicCellValue, DynamicColumn } from '@/lib/types';
import { format } from '@/lib/dateUtils';

export function pastelTagColor(label: string): { bg: string; text: string; border: string } {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash << 5) - hash + label.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  const rgb = hslToRgb(hue / 360, 0.7, 0.85);
  const rgbBorder = hslToRgb(hue / 360, 0.7, 0.75);
  const rgbText = hslToRgb(hue / 360, 0.7, 0.4);
  return {
    bg: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    text: `rgb(${rgbText[0]}, ${rgbText[1]}, ${rgbText[2]})`,
    border: `rgb(${rgbBorder[0]}, ${rgbBorder[1]}, ${rgbBorder[2]})`,
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function isProgressColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'progress';
}

export function isStarsColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'stars';
}

export function normalizeProgressValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped / 10) * 10;
}

export function normalizeStarsValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(5, Math.round(n)));
}

export function assigneesCompactLabel(raw: string[] | null | undefined): string {
  const list = Array.isArray(raw) ? raw.map((x) => x.trim()).filter(Boolean) : [];
  if (list.length === 0) return 'Sin asignar';
  if (list.length === 1) return list[0];
  return `${list[0]} +${list.length - 1}`;
}

export function safeFormatDateLike(date: Date | string | null | undefined, formatStr: string): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!isValid(d)) return '—';
    return format(d, formatStr);
  } catch {
    return '—';
  }
}

function isValid(date: any): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}
