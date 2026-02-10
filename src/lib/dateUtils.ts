import {
  eachDayOfInterval,
  isWeekend,
  isSameDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  differenceInCalendarDays,
  getDay,
  addDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { AppConfig, NonWorkingDay } from './types';

export function isHoliday(date: Date, holidays: NonWorkingDay[]): boolean {
  return holidays.some((h) => {
    if (h.recurring) {
      return date.getMonth() === h.date.getMonth() && date.getDate() === h.date.getDate();
    }
    return isSameDay(date, h.date);
  });
}

export function isWorkingDay(date: Date, config: AppConfig): boolean {
  const dayOfWeek = getDay(date);
  if (config.weekendDays.includes(dayOfWeek)) return false;
  if (isHoliday(date, config.holidays)) return false;
  return true;
}

export function getWorkingDays(start: Date, end: Date, config: AppConfig): Date[] {
  if (!start || !end || start > end) return [];
  const allDays = eachDayOfInterval({ start, end });
  return allDays.filter((d) => isWorkingDay(d, config));
}

export function countWorkingDays(start: Date, end: Date, config: AppConfig): number {
  return getWorkingDays(start, end, config).length;
}

export function getDateRange(projects: { startDate: Date | null; endDate: Date | null }[]): { start: Date; end: Date } | null {
  const validDates: Date[] = [];
  projects.forEach((p) => {
    if (p.startDate) validDates.push(p.startDate);
    if (p.endDate) validDates.push(p.endDate);
  });
  if (validDates.length === 0) return null;
  const sorted = validDates.sort((a, b) => a.getTime() - b.getTime());
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

export function getWeekRanges(start: Date, end: Date): { start: Date; end: Date; label: string }[] {
  const ranges: { start: Date; end: Date; label: string }[] = [];
  let current = startOfWeek(start, { weekStartsOn: 1 });
  while (current <= end) {
    const weekEnd = endOfWeek(current, { weekStartsOn: 1 });
    const effectiveEnd = weekEnd > end ? end : weekEnd;
    const effectiveStart = current < start ? start : current;
    ranges.push({
      start: effectiveStart,
      end: effectiveEnd,
      label: `${format(effectiveStart, 'dd MMM', { locale: es })}`,
    });
    current = addDays(weekEnd, 1);
  }
  return ranges;
}

export function getMonthRanges(start: Date, end: Date): { start: Date; end: Date; label: string }[] {
  const ranges: { start: Date; end: Date; label: string }[] = [];
  let current = startOfMonth(start);
  while (current <= end) {
    const monthEnd = endOfMonth(current);
    const effectiveEnd = monthEnd > end ? end : monthEnd;
    const effectiveStart = current < start ? start : current;
    ranges.push({
      start: effectiveStart,
      end: effectiveEnd,
      label: format(current, 'MMM yyyy', { locale: es }),
    });
    current = addDays(monthEnd, 1);
  }
  return ranges;
}

export function formatDateShort(date: Date): string {
  return format(date, 'dd/MM/yy');
}

export function formatDateFull(date: Date): string {
  return format(date, "dd 'de' MMMM, yyyy", { locale: es });
}

export { format, differenceInCalendarDays, isSameDay, eachDayOfInterval, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWeekend, getDay };
export { es };
