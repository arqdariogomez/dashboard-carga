import type { Project } from '@/lib/types';

export function normalizeBranchList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const out: string[] = [];
    value
      .map((x) => String(x).trim())
      .filter(Boolean)
      .forEach((x) => {
        const k = x.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(x);
        }
      });
    return out;
  }
  if (typeof value === 'string') {
    const clean = value.trim();
    return clean ? [clean] : [];
  }
  return [];
}

export function branchLabel(value: Project['branch']): string {
  const list = normalizeBranchList(value);
  return list.join(' / ');
}

export function branchMatches(value: Project['branch'], selected: string[]): boolean {
  if (selected.length === 0) return true;
  const set = new Set(normalizeBranchList(value).map((x) => x.toLowerCase()));
  return selected.some((s) => set.has(s.toLowerCase()));
}

