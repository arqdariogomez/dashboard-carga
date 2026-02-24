export type PersonProfile = { 
  avatarUrl?: string;
  email?: string;
  displayName?: string;
  updatedAt?: string;
  createdAt?: string;
};
export type PersonProfilesMap = Record<string, PersonProfile>;

export function normalizePersonKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function getPersonProfilesStorageKey(boardId: string | null): string {
  return `workload-dashboard-person-profiles:${boardId || 'local'}`;
}

export function loadPersonProfiles(boardId: string | null): PersonProfilesMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getPersonProfilesStorageKey(boardId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, v]) => {
        if (!v || typeof v !== 'object') return false;
        const avatarUrl = (v as { avatarUrl?: unknown }).avatarUrl;
        return typeof avatarUrl === 'string' && avatarUrl.length > 0;
      })
    ) as PersonProfilesMap;
  } catch {
    return {};
  }
}

export function savePersonProfiles(boardId: string | null, profiles: PersonProfilesMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getPersonProfilesStorageKey(boardId), JSON.stringify(profiles));
  } catch {
    // ignore
  }
}

