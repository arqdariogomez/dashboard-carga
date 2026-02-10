import type { NonWorkingDay, AppConfig, FilterState, AppState } from './types';

export const MEXICO_HOLIDAYS: NonWorkingDay[] = [
  { date: new Date(2025, 0, 1), reason: 'Año Nuevo', recurring: true },
  { date: new Date(2025, 1, 3), reason: 'Día de la Constitución', recurring: true },
  { date: new Date(2025, 2, 17), reason: 'Natalicio de Benito Juárez', recurring: true },
  { date: new Date(2025, 4, 1), reason: 'Día del Trabajo', recurring: true },
  { date: new Date(2025, 8, 16), reason: 'Día de la Independencia', recurring: true },
  { date: new Date(2025, 10, 17), reason: 'Revolución Mexicana', recurring: true },
  { date: new Date(2025, 11, 25), reason: 'Navidad', recurring: true },
];

export const DEFAULT_CONFIG: AppConfig = {
  hoursPerDay: 9,
  weekendDays: [0, 6],
  holidays: MEXICO_HOLIDAYS,
  loadMode: 'calculated',
};

export const DEFAULT_FILTERS: FilterState = {
  persons: [],
  branches: [],
  types: [],
  dateRange: null,
  showOnlyActive: false,
};

export const DEFAULT_STATE: AppState = {
  projects: [],
  config: DEFAULT_CONFIG,
  filters: DEFAULT_FILTERS,
  activeView: 'grid',
  granularity: 'week',
  sidebarCollapsed: false,
  fileName: null,
  lastUpdated: null,
  hasUnsavedChanges: false,
  projectOrder: [],
};

export const LOAD_COLORS = {
  none: { bg: '#F3F3F3', text: '#9B9B9B' },
  low: { bg: '#DBEDDB', text: '#2D6A2E' },
  medium: { bg: '#D3E5EF', text: '#1A5276' },
  high: { bg: '#FFF3D1', text: '#7D6608' },
  overload: { bg: '#FADEC9', text: '#8B4513' },
  critical: { bg: '#FFE2DD', text: '#B71C1C' },
};

export const PERSON_COLORS = [
  '#579DFF',
  '#6EC98D',
  '#E2945E',
  '#9F8FEF',
  '#F87171',
  '#F59E0B',
  '#06B6D4',
  '#EC4899',
];

export function getLoadColor(load: number): { bg: string; text: string } {
  if (load === 0) return LOAD_COLORS.none;
  if (load <= 0.5) return LOAD_COLORS.low;
  if (load <= 0.8) return LOAD_COLORS.medium;
  if (load <= 1.0) return LOAD_COLORS.high;
  if (load <= 1.3) return LOAD_COLORS.overload;
  return LOAD_COLORS.critical;
}

export const SAMPLE_DATA = [
  { name: "Oficinas Corp.", branch: "CORPO", startDate: new Date(2025, 0, 15), endDate: new Date(2025, 1, 14), assignees: ["Eduardo"], daysRequired: 15, priority: 4, type: "Proyecto" as const },
  { name: "Cristales de Naica Pt.1", branch: "CHIH-REFUND", startDate: new Date(2025, 0, 15), endDate: new Date(2025, 0, 23), assignees: ["Darío"], daysRequired: 5, priority: 5, type: "Lanzamiento" as const, blocksTo: "Columb. Naica Construct." },
  { name: "Remodelación caja Tijuana", branch: "TIJUANA", startDate: new Date(2025, 0, 15), endDate: new Date(2025, 0, 31), assignees: ["Eduardo"], daysRequired: 2, priority: 1, type: "Proyecto" as const },
  { name: "Mobil. exterior Tijuana", branch: "TIJUANA", startDate: new Date(2025, 0, 15), endDate: new Date(2025, 1, 3), assignees: ["Eduardo"], daysRequired: 2, priority: 3, type: "Proyecto" as const },
  { name: "Iluminación USM", branch: "CHIH-REFUND", startDate: new Date(2025, 0, 15), endDate: new Date(2025, 1, 3), assignees: ["Eduardo"], daysRequired: 2, priority: 2, type: "Proyecto" as const },
  { name: "Módulo D1", branch: "CHIH", startDate: new Date(2025, 0, 17), endDate: new Date(2025, 0, 20), assignees: ["Eduardo"], daysRequired: 1, priority: 3, type: "Proyecto" as const },
  { name: "Techo Virgen Gpe", branch: "DELICIAS", startDate: new Date(2025, 0, 21), endDate: new Date(2025, 0, 31), assignees: ["Darío"], daysRequired: 2, priority: 4, type: "Proyecto" as const },
  { name: "Amantes Preventa", branch: "CHIH-REFUND", startDate: new Date(2025, 0, 27), endDate: new Date(2025, 1, 14), assignees: ["Darío"], daysRequired: 4, priority: 5, type: "Lanzamiento" as const, blocksTo: "Amantes Constructivo" },
  { name: "Malta Preventa", branch: "CHIH-REFUND", startDate: new Date(2025, 0, 31), endDate: new Date(2025, 1, 13), assignees: ["Darío"], daysRequired: 7, priority: 5, type: "Lanzamiento" as const, blocksTo: "Malta Constructivo" },
  { name: "Vida eterna DLS", branch: "DELICIAS", startDate: new Date(2025, 1, 3), endDate: new Date(2025, 1, 16), assignees: ["Diana"], daysRequired: 4, priority: 1, type: "Lanzamiento" as const },
  { name: "Escultura Naica Construct.", branch: "CHIH-REFUND", startDate: new Date(2025, 1, 4), endDate: new Date(2025, 1, 17), assignees: ["Darío"], daysRequired: 5, priority: 2, type: "Lanzamiento" as const },
  { name: "Torre campanario", branch: "JUAREZ", startDate: new Date(2025, 1, 13), endDate: new Date(2025, 1, 28), assignees: ["Darío"], daysRequired: 10, priority: 5, type: "Lanzamiento" as const },
  { name: "Sala atn cliente Ed.1", branch: "CHIH", startDate: new Date(2025, 1, 17), endDate: new Date(2025, 2, 13), assignees: ["Eduardo"], daysRequired: 4, priority: 1, type: "Proyecto" as const, blocksTo: "Sala atn cliente E2" },
  { name: "Escultura Naica Preventa", branch: "CHIH-REFUND", startDate: new Date(2025, 2, 3), endDate: new Date(2025, 2, 28), assignees: ["Darío"], daysRequired: 10, priority: 5, type: "Lanzamiento" as const },
  { name: "Amantes Constructivo", branch: "CHIH-REFUND", startDate: new Date(2025, 2, 4), endDate: new Date(2025, 2, 14), assignees: ["Darío"], daysRequired: 5, priority: 5, type: "Lanzamiento" as const, blockedBy: "Amantes Preventa" },
  { name: "Malta Constructivo", branch: "CHIH-REFUND", startDate: new Date(2025, 2, 17), endDate: new Date(2025, 4, 1), assignees: ["Darío"], daysRequired: 15, priority: 5, type: "Lanzamiento" as const, blockedBy: "Malta Preventa" },
  { name: "Monumento alcalde", branch: "DELICIAS", startDate: new Date(2025, 2, 17), endDate: new Date(2025, 3, 22), assignees: ["Eduardo"], daysRequired: 10, priority: 4, type: "Proyecto" as const },
  { name: "Columb. Naica Construct.", branch: "CHIH-REFUND", startDate: new Date(2025, 3, 17), endDate: new Date(2025, 6, 1), assignees: ["Darío"], daysRequired: 8, priority: 2, type: "Lanzamiento" as const, blockedBy: "Cristales de Naica Pt.1" },
  { name: "Santuario de la luz Preventa", branch: "CHIH-REFUND", startDate: new Date(2025, 3, 18), endDate: new Date(2025, 4, 7), assignees: ["Diana"], daysRequired: 6, priority: 5, type: "Lanzamiento" as const },
  { name: "Señaletica publicidad", branch: "CORPO", startDate: new Date(2025, 4, 9), endDate: new Date(2025, 6, 11), assignees: ["Diana"], daysRequired: 20, priority: 3, type: "Proyecto" as const },
  { name: "Nvo. recinto precio bajo", branch: "CHIH-REFUND", startDate: new Date(2025, 4, 2), endDate: new Date(2025, 4, 17), assignees: ["Darío"], daysRequired: 9, priority: 5, type: "Lanzamiento" as const },
  { name: "Showroom y atn cliente", branch: "JUAREZ", startDate: null, endDate: null, assignees: ["Darío"], daysRequired: 20, priority: 1, type: "Proyecto" as const },
  { name: "Ofic. defin. Juarez", branch: "JUAREZ", startDate: null, endDate: null, assignees: ["Darío"], daysRequired: 15, priority: 3, type: "Proyecto" as const },
  { name: "Nichos variantes Ref", branch: "CHIH-REFUND", startDate: null, endDate: null, assignees: [], daysRequired: 0, priority: 1, type: "En radar" as const },
  { name: "Escaleras nichos Sta rita", branch: "CHIH", startDate: null, endDate: null, assignees: [], daysRequired: 0, priority: 1, type: "En radar" as const },
];
