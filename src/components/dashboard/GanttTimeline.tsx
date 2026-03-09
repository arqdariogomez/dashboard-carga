import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useUiFeedback } from '@/context/UiFeedbackContext';
import { usePersonProfiles } from '@/context/PersonProfilesContext';
import {
  getPersons,
  getActiveProjects,
  computeProjectFields,
} from '@/lib/workloadEngine';
import { buildHierarchy, isParent } from '@/lib/hierarchyEngine';
import { getDateRange, format } from '@/lib/dateUtils';
import { differenceInCalendarDays, addDays } from 'date-fns';
import { getLoadColor, PERSON_COLORS } from '@/lib/constants';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CalendarRange,
  Link2,
  Diamond,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Plus,
  MoreHorizontal,
  Copy,
  Trash2,
  Pencil,
  Save,
} from 'lucide-react';
import { ToolbarDropdown, ToolbarDropdownWithActions, TOOLBAR_ICONS } from '@/components/shared/ModernToolbar';
import type { Project } from '@/lib/types';
import { branchLabel } from '@/lib/branchUtils';
import { GanttTreeOverlay } from '@/modules/gantt/components/GanttTreeOverlay';
import { useGanttTreeGeometry } from '@/modules/gantt/hooks/useGanttTreeGeometry';
import React from 'react';
import { createPortal } from 'react-dom';

// ────────────────────────────────────────────
//  DESIGN TOKENS (Nuevo Sistema Evolucionado)
// ────────────────────────────────────────────
import { COLORS, TYPOGRAPHY, DIMENSIONS, SHADOWS, TRANSITIONS } from '@/lib/designTokens';

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════

type ColorMode = 'load' | 'person' | 'type' | 'custom';
type CustomColorField = 'branch' | 'type';
type GroupMode = 'none' | 'person' | 'type' | 'custom';
type CustomGroupField = 'branch' | 'priority';
type OrderMode = 'chronological' | 'custom';
type TimePreset = '2W' | '1M' | '3M' | '6M' | 'ALL';

interface TooltipData {
  project: Project;
  x: number;
  y: number;
}

interface BarResizeState {
  projectId: string;
  type: 'start' | 'end';
  startX: number;
  originStart: Date;
  originEnd: Date;
  offsetDays: number;
}

interface MilestoneDragState {
  projectId: string;
  startX: number;
  originDate: Date;
  offsetDays: number;
}

interface BarStyle {
  bg: string;
  text: string;
  border: string;
  preview: string;
}

interface BarProps {
  left: number;
  width: number;
  style: BarStyle;
  startOff: number;
  endOff: number;
}

interface HierarchyNode extends Project {
  children?: HierarchyNode[];
}

interface TimelineGroup {
  id: string;
  label: string;
  projects: Project[];
}

interface TimelineViewPreset {
  id: string;
  name: string;
  groupMode: GroupMode;
  customGroupField: CustomGroupField;
  orderMode: OrderMode;
  colorMode: ColorMode;
  customColorField: CustomColorField;
  showMilestonesOnly: boolean;
}

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════

const MIN_SIDEBAR_WIDTH = 320;
const MAX_SIDEBAR_WIDTH = 760;
const MIN_BAR_WIDTH = 12;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_WHEEL_FACTOR = 1.15;

const sliderToZoom = (t: number): number => {
  const logMin = Math.log(MIN_ZOOM);
  const logMax = Math.log(MAX_ZOOM);
  return Math.exp(logMin + t * (logMax - logMin));
};

const zoomToSlider = (zoom: number): number => {
  const logMin = Math.log(MIN_ZOOM);
  const logMax = Math.log(MAX_ZOOM);
  return (Math.log(zoom) - logMin) / (logMax - logMin);
};

const PRESET_DAYS: Record<TimePreset, number | null> = {
  '2W': 14,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  ALL: null,
};

const PRESET_LABELS: Record<TimePreset, string> = {
  '2W': '2S',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  ALL: 'Todo',
};

// ═══════════════════════════════════════════════
//  PURE UTILITIES
// ═══════════════════════════════════════════════

function isMilestoneProject(project: Project): boolean {
  if (!project.startDate || !project.endDate) return false;
  const same =
    project.startDate.getFullYear() === project.endDate.getFullYear() &&
    project.startDate.getMonth() === project.endDate.getMonth() &&
    project.startDate.getDate() === project.endDate.getDate();
  return same && Number(project.daysRequired || 0) <= 0;
}

function parseDependencyIds(project: Project, all: Project[]): string[] {
  const raw = (project.blocksTo || '').trim();
  if (!raw) return [];
  const byId = new Map(all.map((p) => [p.id, p]));
  const byName = new Map(
    all.map((p) => [(p.name || '').trim().toLowerCase(), p]),
  );
  const parse = (tokens: string[]) => {
    const out: string[] = [];
    tokens.forEach((t) => {
      const c = t.trim();
      if (!c) return;
      if (byId.has(c)) {
        out.push(c);
        return;
      }
      const h = byName.get(c.toLowerCase());
      if (h) out.push(h.id);
    });
    return [...new Set(out)];
  };
  if (raw.startsWith('[')) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return parse(p.map(String));
    } catch {
      /* empty */
    }
  }
  return parse(raw.split(/[|,]/g));
}

function encodeDependencyIds(ids: string[]): string | null {
  const c = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  return c.length === 0 ? null : JSON.stringify(c);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function colorFromString(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return hslToHex(Math.abs(h) % 360, 62, 47);
}

function hslToHex(h: number, s: number, l: number): string {
  const sa = s / 100,
    li = l / 100;
  const c = (1 - Math.abs(2 * li - 1)) * sa;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = li - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function computeBarProps(
  project: Project,
  rangeStart: Date,
  totalDays: number,
  dayWidth: number,
  colorMode: ColorMode,
  customColorField: CustomColorField,
  personColorMap: Map<string, string>,
): BarProps | null {
  if (!project.startDate || !project.endDate) return null;
  const sOff = differenceInCalendarDays(project.startDate, rangeStart);
  const eOff = differenceInCalendarDays(project.endDate, rangeStart) + 1;
  const left = Math.max(0, sOff) * dayWidth;
  const width = (Math.min(eOff, totalDays) - Math.max(0, sOff)) * dayWidth;

  const lc = getLoadColor(project.dailyLoad);
  const pc = personColorMap.get(project.assignees[0] || '') || '#64748B';
  const tc = colorFromString(project.type || 'Proyecto');
  const cv =
    customColorField === 'branch'
      ? branchLabel(project.branch)
      : project.type;
  const cc = colorFromString(cv || 'Sin valor');
  const solid =
    colorMode === 'person'
      ? pc
      : colorMode === 'type'
        ? tc
        : colorMode === 'custom'
          ? cc
          : null;
  const style: BarStyle = solid
    ? {
        bg: hexToRgba(solid, 0.2),
        text: solid,
        border: hexToRgba(solid, 0.42),
        preview: hexToRgba(solid, 0.28),
      }
    : {
        bg: lc.bg,
        text: lc.text,
        border: `${lc.text}35`,
        preview: `${lc.text}30`,
      };

  return {
    left,
    width: Math.max(width, MIN_BAR_WIDTH),
    style,
    startOff: sOff,
    endOff: eOff,
  };
}

// ═══════════════════════════════════════════════
//  ZOOM SLIDER COMPONENT
// ═══════════════════════════════════════════════

function ZoomSlider({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (z: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const listenersRef = useRef<{
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null>(null);

  const sliderValue = zoomToSlider(zoom);

  const applyFromMouse = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const t = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(sliderToZoom(t));
    },
    [onChange],
  );

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.move);
        document.removeEventListener('mouseup', listenersRef.current.up);
      }
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      applyFromMouse(e.clientX);

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        requestAnimationFrame(() => {
          applyFromMouse(ev.clientX);
        });
      };
      const onUp = () => {
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        listenersRef.current = null;
      };

      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.move);
        document.removeEventListener('mouseup', listenersRef.current.up);
      }

      listenersRef.current = { move: onMove, up: onUp };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [applyFromMouse],
  );

  const fitAllPos = zoomToSlider(1) * 100;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          onChange(clamp(zoom / ZOOM_WHEEL_FACTOR, MIN_ZOOM, MAX_ZOOM))
        }
        className="h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-gray-50 flex-shrink-0 transition-colors"
        title="Alejar"
      >
        <Minus size={14} />
      </button>

      <div
        ref={trackRef}
        className="relative h-7 flex-1 min-w-[120px] max-w-[200px] cursor-pointer flex items-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full">
          <div
            className="absolute left-0 top-0 bottom-0 bg-blue-400 rounded-full transition-[width] duration-75"
            style={{ width: `${sliderValue * 100}%` }}
          />
          <div
            className="absolute top-[-3px] w-0.5 h-[12px] bg-gray-400/50 rounded-full"
            style={{ left: `${fitAllPos}%` }}
            title="Ajustar todo"
          />
        </div>

        <div
          className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-sm transform -translate-x-1/2 transition-[left] duration-75 group-active:scale-110 hover:border-blue-600 hover:shadow-md"
          style={{ left: `${sliderValue * 100}%` }}
        />
      </div>

      <button
        onClick={() =>
          onChange(clamp(zoom * ZOOM_WHEEL_FACTOR, MIN_ZOOM, MAX_ZOOM))
        }
        className="h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-gray-50 flex-shrink-0 transition-colors"
        title="Acercar"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  MINIMAP COMPONENT
// ═══════════════════════════════════════════════

function Minimap({
  projects,
  rangeStart,
  totalDays,
  todayOffset,
  showTodayLine,
  viewStartDay,
  viewEndDay,
  onPan,
}: {
  projects: Project[];
  rangeStart: Date;
  totalDays: number;
  todayOffset: number;
  showTodayLine: boolean;
  viewStartDay: number;
  viewEndDay: number;
  onPan: (centerDay: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const viewLeftPct = (viewStartDay / totalDays) * 100;
  const viewWidthPct = ((viewEndDay - viewStartDay) / totalDays) * 100;

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.viewport) return;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onPan(ratio * totalDays);
    },
    [totalDays, onPan],
  );

  const handleViewportDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const track = trackRef.current;
      if (!track) return;
      const trackRect = track.getBoundingClientRect();
      const startX = e.clientX;
      const startCenter = (viewStartDay + viewEndDay) / 2;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dDays = (dx / trackRect.width) * totalDays;
        onPan(startCenter + dDays);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [viewStartDay, viewEndDay, totalDays, onPan],
  );

  const bars = useMemo(
    () =>
      projects
        .filter((p) => p.startDate && p.endDate)
        .map((p) => {
          const s = differenceInCalendarDays(p.startDate!, rangeStart);
          const e = differenceInCalendarDays(p.endDate!, rangeStart) + 1;
          return {
            id: p.id,
            lPct: (Math.max(0, s) / totalDays) * 100,
            wPct:
              ((Math.min(e, totalDays) - Math.max(0, s)) / totalDays) * 100,
          };
        }),
    [projects, rangeStart, totalDays],
  );

  return (
    <div
      ref={trackRef}
      className="relative h-7 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer select-none overflow-hidden"
      onClick={handleTrackClick}
    >
      {bars.map((b) => (
        <div
          key={b.id}
          className="absolute top-[8px] h-[6px] bg-gray-300/50 rounded-sm pointer-events-none"
          style={{
            left: `${b.lPct}%`,
            width: `${Math.max(b.wPct, 0.3)}%`,
          }}
        />
      ))}

      {showTodayLine && (
        <>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-400/50 pointer-events-none"
            style={{ left: `${(todayOffset / totalDays) * 100}%` }}
          />
          <div
            className="absolute top-1/2 w-3 h-3 bg-blue-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
            style={{ left: `${(todayOffset / totalDays) * 100}%` }}
          />
        </>
      )}

      <div
        data-viewport="true"
        className="absolute top-0 bottom-0 bg-blue-500/8 border-x-2 border-blue-500/30 cursor-grab active:cursor-grabbing hover:bg-blue-500/12 transition-colors"
        style={{
          left: `${viewLeftPct}%`,
          width: `${Math.max(viewWidthPct, 1)}%`,
        }}
        onMouseDown={handleViewportDrag}
      >
        <div className="absolute inset-0 flex items-center justify-center gap-[2px] pointer-events-none opacity-40">
          <div className="w-0.5 h-2 bg-blue-500 rounded-full" />
          <div className="w-0.5 h-2 bg-blue-500 rounded-full" />
          <div className="w-0.5 h-2 bg-blue-500 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  GANTT ROW (memoized)
// ═══════════════════════════════════════════════

interface GanttRowProps {
  node: HierarchyNode;
  pList: Project[];
  level: number;
  sidebarWidth: number;
  dayWidth: number;
  timelineWidth: number;
  todayOffset: number;
  showTodayLine: boolean;
  getBarProps: (p: Project) => BarProps | null;
  dependencies: { from: Project; to: Project }[];
  dependencyNames: string[];
  barResize: BarResizeState | null;
  milestoneDrag: MilestoneDragState | null;
  editingProjectId: string | null;
  editingProjectName: string;
  isExpanded: boolean;
  hasChildren: boolean;
  isMilestone: boolean;
  onBarHover: (e: React.MouseEvent, project: Project) => void;
  onBarLeave: () => void;
  onStartEditName: (id: string, name: string) => void;
  onEditNameChange: (value: string) => void;
  onCommitEditName: () => void;
  onCancelEditName: () => void;
  onToggleExpansion: (id: string) => void;
  onToggleMilestone: (project: Project) => void;
  onOpenDependencyEditor: (id: string) => void;
  onStartBarResize: (
    e: React.MouseEvent,
    project: Project,
    type: 'start' | 'end',
  ) => void;
  onStartMilestoneDrag: (e: React.MouseEvent, project: Project) => void;
  onCreateProjectFrom: (project: Project) => void;
  onDuplicateProjectFrom: (project: Project) => void;
  onDeleteProjectById: (projectId: string) => void;
  onMoveRowUp: (projectId: string) => void;
  onMoveRowDown: (projectId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isSidebarCollapsed: boolean;
  rowRef?: (el: HTMLElement | null) => void;
}

const GanttRow = React.memo(function GanttRow({
  node,
  pList,
  level,
  sidebarWidth,
  dayWidth,
  timelineWidth,
  todayOffset,
  showTodayLine,
  getBarProps: getBarPropsFn,
  dependencies: depsFor,
  dependencyNames: depNames,
  barResize,
  milestoneDrag,
  editingProjectId,
  editingProjectName,
  isExpanded,
  hasChildren,
  isMilestone: ms,
  onBarHover,
  onBarLeave,
  onStartEditName,
  onEditNameChange,
  onCommitEditName,
  onCancelEditName,
  onToggleExpansion,
  onToggleMilestone,
  onOpenDependencyEditor,
  onStartBarResize,
  onStartMilestoneDrag,
  onCreateProjectFrom,
  onDuplicateProjectFrom,
  onDeleteProjectById,
  onMoveRowUp,
  onMoveRowDown,
  canMoveUp,
  canMoveDown,
  isSidebarCollapsed,
  rowRef,
}: GanttRowProps) {
  const bar = getBarPropsFn(node);
  if (!bar) return null;
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuPopupRef = useRef<HTMLDivElement | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!rowMenuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      const clickedTrigger = rowMenuRef.current?.contains(target);
      const clickedMenu = rowMenuPopupRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setRowMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [rowMenuOpen]);

  const openRowMenuAt = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return;
    const menuW = 176;
    const menuH = 224;
    const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
    setRowMenuPos({ top, left });
    setRowMenuOpen(true);
  }, []);

  const openRowMenuFromButton = useCallback((rect: DOMRect) => {
    if (typeof window === 'undefined') return;
    const menuW = 176;
    const menuH = 224;
    const gap = 6;

    let left = rect.right + gap;
    if (left + menuW > window.innerWidth - 8) {
      left = rect.left - menuW - gap;
    }

    let top = rect.bottom + gap;
    if (top + menuH > window.innerHeight - 8) {
      top = rect.top - menuH - gap;
    }

    openRowMenuAt(left, top);
  }, [openRowMenuAt]);

  const dragOff =
    milestoneDrag?.projectId === node.id ? milestoneDrag.offsetDays : 0;
  const indentStepPx = 12;

  // Visual resize preview
  const resizeState = barResize?.projectId === node.id ? barResize : null;
  let visualLeft = bar.left;
  let visualWidth = bar.width;

  if (resizeState && resizeState.offsetDays !== 0) {
    const offsetPx = resizeState.offsetDays * dayWidth;
    if (resizeState.type === 'start') {
      visualLeft = bar.left + offsetPx;
      visualWidth = bar.width - offsetPx;
    } else {
      visualWidth = bar.width + offsetPx;
    }
    visualWidth = Math.max(visualWidth, MIN_BAR_WIDTH);
  }

  return (
    <div
      ref={rowRef}
      className="relative z-0 flex border-b border-border hover:bg-bg-secondary/20 transition-colors group group/bar"
    >
      {/* Sidebar */}
      <div
        className="relative px-3 py-2 border-r border-border sticky left-0 z-50 bg-white group-hover/bar:bg-bg-secondary transition-colors"
        style={{ width: sidebarWidth, minWidth: sidebarWidth }}
        onDoubleClick={() => onStartEditName(node.id, node.name)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative w-5 flex-shrink-0" ref={rowMenuRef}>
            <button
              type="button"
              className="h-5 w-5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group-hover/bar:opacity-100 focus-visible:opacity-100 text-text-secondary transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                if (rowMenuOpen) {
                  setRowMenuOpen(false);
                  setRowMenuPos(null);
                } else {
                  openRowMenuFromButton(rect);
                }
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Acciones de fila"
            >
              <MoreHorizontal size={12} />
            </button>
            {rowMenuOpen && rowMenuPos && typeof document !== 'undefined'
              ? createPortal(
              <div
                ref={rowMenuPopupRef}
                className="fixed z-[900] w-44 rounded-lg border border-border bg-white shadow-lg p-1 pointer-events-auto"
                style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onCreateProjectFrom(node);
                    setRowMenuOpen(false);
                  }}
                >
                  <Plus size={12} />
                  Nuevo
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onDuplicateProjectFrom(node);
                    setRowMenuOpen(false);
                  }}
                >
                  <Copy size={12} />
                  Duplicar
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onStartEditName(node.id, node.name);
                    setRowMenuOpen(false);
                  }}
                >
                  <Pencil size={12} />
                  Renombrar
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onToggleMilestone(node);
                    setRowMenuOpen(false);
                  }}
                >
                  <Diamond size={12} />
                  {ms ? 'Quitar hito' : 'Marcar hito'}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2"
                  onClick={() => {
                    onOpenDependencyEditor(node.id);
                    setRowMenuOpen(false);
                  }}
                >
                  <Link2 size={12} />
                  Dependencias
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  disabled={!canMoveUp}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    onMoveRowUp(node.id);
                    setRowMenuOpen(false);
                  }}
                >
                  <ChevronUp size={12} />
                  Mover arriba
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    onMoveRowDown(node.id);
                    setRowMenuOpen(false);
                  }}
                >
                  <ChevronDown size={12} />
                  Mover abajo
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-xs rounded text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
                  onClick={() => {
                    onDeleteProjectById(node.id);
                    setRowMenuOpen(false);
                  }}
                >
                  <Trash2 size={12} />
                  Eliminar
                </button>
              </div>,
              document.body
            )
              : null}
          </div>
          {!isSidebarCollapsed && (
            <>
              <div
                data-gantt-name-cell
                style={{ paddingLeft: level * indentStepPx }}
                className="relative min-w-0 flex-1 flex items-center"
              >
                {hasChildren && (
                  <button
                    onClick={() => onToggleExpansion(node.id)}
                    onDoubleClick={(e) => e.stopPropagation()}
                    className="relative z-10 mr-2 text-text-secondary flex-shrink-0 hover:text-text-primary transition-colors"
                    aria-label={isExpanded ? 'Colapsar' : 'Expandir'}
                  >
                    {isExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                  </button>
                )}
                {editingProjectId === node.id ? (
                  <input
                    autoFocus
                    value={editingProjectName}
                    onChange={(e) => onEditNameChange(e.target.value)}
                    onBlur={onCommitEditName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitEditName();
                      if (e.key === 'Escape') onCancelEditName();
                    }}
                    className="w-full bg-transparent border border-border rounded px-1.5 py-0.5 text-xs text-text-primary outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <div
                    className="relative z-10 text-xs text-text-primary truncate cursor-text"
                    title={node.name}
                  >
                    {node.name}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-text-secondary pl-2 flex items-center gap-1.5 flex-shrink-0">
                <span className="max-w-[84px] truncate">
                  {branchLabel(node.branch)}
                </span>
                <span>·</span>
                <span className="tabular-nums">{node.daysRequired}d</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Timeline cell */}
      <div className="relative z-0 flex-1 h-12 flex items-center overflow-hidden">
        {ms ? (
          <div
            className="absolute z-[1] h-3.5 w-3.5 rotate-45 rounded-[2px] border shadow-sm cursor-pointer hover:scale-125 transition-transform"
            style={{
              left: bar.left - 7 + dragOff * dayWidth,
              top: 17,
              background: bar.style.bg,
              borderColor: bar.style.border,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStartMilestoneDrag(e, node);
            }}
            onMouseEnter={(ev) => onBarHover(ev, node)}
            onMouseLeave={onBarLeave}
          />
        ) : (
          <div
            className="absolute z-[1] h-7 rounded-md flex items-center overflow-hidden cursor-pointer group/resize hover:shadow-md hover:brightness-[0.97] transition-all duration-150"
            style={{
              left: visualLeft,
              width: visualWidth,
              background: bar.style.bg,
              border: `1px solid ${bar.style.border}`,
            }}
            onMouseEnter={(ev) => onBarHover(ev, node)}
            onMouseLeave={onBarLeave}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 opacity-0 group-hover/resize:opacity-100 transition-opacity"
              onMouseDown={(e) => onStartBarResize(e, node, 'start')}
            />
            {visualWidth > 40 && (
              <span
                className="text-[10px] font-semibold truncate px-2 whitespace-nowrap leading-none"
                style={{
                  color: bar.style.text,
                  textShadow: '0 0 3px rgba(255,255,255,0.8)',
                }}
              >
                {node.name}
              </span>
            )}
            <div
              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 opacity-0 group-hover/resize:opacity-100 transition-opacity"
              onMouseDown={(e) => onStartBarResize(e, node, 'end')}
            />
          </div>
        )}

        {/* Dependency arrows */}
        {depsFor.map((dep) => {
          const tb = getBarPropsFn(dep.to);
          if (!tb) return null;
          const fx = visualLeft + visualWidth;
          const tx = tb.left;
          if (tx <= fx) return null;
          const y = 24;
          return (
            <svg
              key={`${dep.from.id}-${dep.to.id}`}
              className="absolute top-0 left-0 pointer-events-none z-0"
              style={{ width: timelineWidth, height: 48 }}
            >
              <path
                d={`M ${fx} ${y} C ${fx + 20} ${y}, ${tx - 20} ${y}, ${tx} ${y}`}
                fill="none"
                stroke="#6889C8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                opacity="0.75"
              />
              <polygon
                points={`${tx - 5},${y - 4} ${tx},${y} ${tx - 5},${y + 4}`}
                fill="#6889C8"
                opacity="0.75"
              />
            </svg>
          );
        })}

        {showTodayLine && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-400/40 pointer-events-none"
            style={{ left: todayOffset * dayWidth }}
          />
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════
//  DEPENDENCIES MODAL
// ═══════════════════════════════════════════════

function DependenciesModal({
  projectId,
  projects,
  selectedIds,
  onClose,
  onSave,
}: {
  projectId: string;
  projects: Project[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const modalRef = useRef<HTMLDivElement>(null);
  const target = projects.find((p) => p.id === projectId);
  const options = useMemo(
    () =>
      projects
        .filter((p) => p.id !== projectId)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [projects, projectId],
  );

  useEffect(() => setDraft(selectedIds), [selectedIds]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[260] bg-black/35 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Dependencias de ${target?.name || 'Proyecto'}`}
        className="w-full max-w-lg rounded-xl border border-border bg-white shadow-2xl p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-text-primary">
          Dependencias
        </div>
        <div className="text-xs text-text-secondary mt-1">
          {target?.name || 'Proyecto'} depende de...
        </div>
        <div className="mt-3 max-h-[48vh] overflow-auto rounded-lg border border-border p-2 space-y-0.5">
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={draft.includes(opt.id)}
                onChange={(e) =>
                  setDraft((p) =>
                    e.target.checked
                      ? [...new Set([...p, opt.id])]
                      : p.filter((i) => i !== opt.id),
                  )
                }
                className="rounded border-gray-300"
              />
              <span className="text-xs text-text-primary truncate">
                {opt.name}
              </span>
            </label>
          ))}
          {!options.length && (
            <div className="px-2 py-4 text-xs text-text-secondary text-center">
              Sin proyectos disponibles.
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="px-3.5 py-2 text-xs rounded-lg border border-border hover:bg-bg-secondary transition-colors"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="px-3.5 py-2 text-xs rounded-lg bg-text-primary text-white hover:bg-[#171B22] transition-colors"
            onClick={() => onSave(draft)}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  GANTT TOOLTIP
// ═══════════════════════════════════════════════

function GanttTooltip({
  project,
  x,
  y,
  sidebarWidth,
  containerWidth,
  containerHeight,
  dependencyNames,
}: {
  project: Project;
  x: number;
  y: number;
  sidebarWidth: number;
  containerWidth: number;
  containerHeight: number;
  dependencyNames: string[];
}) {
  const lc = getLoadColor(project.dailyLoad);
  const pct = Math.round(project.dailyLoad * 100);
  const tw = 260;
  const ml = Math.max(
    sidebarWidth + 12,
    (containerWidth || window.innerWidth) - tw - 8,
  );
  const left = Math.max(sidebarWidth + 12, Math.min(x + 10, ml));

  const showBelow = y < 160;
  const topStyle = showBelow
    ? { top: y + 20 }
    : { top: y - 10, transform: 'translateY(-100%)' };

  return (
    <div
      className="absolute z-50 bg-white border border-border rounded-xl shadow-xl p-3.5 min-w-[220px] max-w-[280px] pointer-events-none"
      style={{ left, ...topStyle }}
    >
      <div className="font-semibold text-sm text-text-primary mb-1 truncate">
        {project.name}
      </div>
      <div className="text-[11px] text-text-secondary mb-2.5">
        {branchLabel(project.branch)} · {project.type}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div className="text-text-secondary">Inicio</div>
        <div className="text-text-primary tabular-nums">
          {project.startDate
            ? format(project.startDate, 'dd/MM/yyyy')
            : '—'}
        </div>
        <div className="text-text-secondary">Fin</div>
        <div className="text-text-primary tabular-nums">
          {project.endDate
            ? format(project.endDate, 'dd/MM/yyyy')
            : '—'}
        </div>
        <div className="text-text-secondary">Dias req.</div>
        <div className="text-text-primary font-medium">
          {project.daysRequired}
        </div>
        <div className="text-text-secondary">Dias asig.</div>
        <div className="text-text-primary">{project.assignedDays}</div>
        <div className="text-text-secondary">Balance</div>
        <div
          className={
            project.balanceDays >= 0
              ? 'text-[#2D6A2E] font-medium'
              : 'text-[#B71C1C] font-medium'
          }
        >
          {project.balanceDays > 0 ? '+' : ''}
          {project.balanceDays}d
        </div>
        <div className="text-text-secondary">Carga</div>
        <div>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: lc.bg, color: lc.text }}
          >
            {pct}%
          </span>
        </div>
      </div>
      {project.blockedBy && (
        <div className="mt-2.5 pt-2 border-t border-border text-[11px]">
          <span className="text-text-secondary">Bloqueado por: </span>
          <span className="text-accent-purple font-medium">
            {project.blockedBy}
          </span>
        </div>
      )}
      {dependencyNames.length > 0 && (
        <div className="mt-1 text-[11px]">
          <span className="text-text-secondary">Depende de: </span>
          <span className="text-accent-purple font-medium">
            {dependencyNames.join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════

export function GanttTimeline() {
  const {
    state,
    dispatch,
    filteredProjects,
    dateRange: globalRange,
    activeBoardId,
  } = useProject();
  const { confirm } = useUiFeedback();
  const { getAvatarUrl } = usePersonProfiles();

  // ── State ──
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(
    null,
  );
  const [editingProjectName, setEditingProjectName] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const [colorMode, setColorMode] = useState<ColorMode>('type');
  const [customColorField, setCustomColorField] =
    useState<CustomColorField>('branch');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [customGroupField, setCustomGroupField] =
    useState<CustomGroupField>('branch');
  const [orderMode, setOrderMode] = useState<OrderMode>('chronological');
  const [dependencyEditorProjectId, setDependencyEditorProjectId] = useState<
    string | null
  >(null);
  const [showMilestonesOnly, setShowMilestonesOnly] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [activePreset, setActivePreset] = useState<TimePreset | null>('ALL');
  const [timelineViews, setTimelineViews] = useState<TimelineViewPreset[]>([]);
  const [activeTimelineViewId, setActiveTimelineViewId] = useState<string>('__current__');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [barResize, setBarResize] = useState<BarResizeState | null>(null);
  const [milestoneDrag, setMilestoneDrag] =
    useState<MilestoneDragState | null>(null);

  // ── Refs ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tooltipContainerRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const sidebarExpandedWidthRef = useRef(500);
  const suppressScrollRef = useRef(false);
  const scrollRafRef = useRef(0);
  const barResizeRef = useRef<BarResizeState | null>(null);
  const milestoneDragRef = useRef<MilestoneDragState | null>(null);

  // ── Tree connector overlay hook ──
  const {
    rowRefs: treeRowRefs,
    groupHostRefs: treeGroupHostRefs,
    version: treeVersion,
    registerRow: treeRegisterRow,
    registerGroupHost: treeRegisterGroupHost,
    invalidate: invalidateTree,
  } = useGanttTreeGeometry();

  // Keep refs in sync with state
  useEffect(() => {
    barResizeRef.current = barResize;
  }, [barResize]);
  useEffect(() => {
    milestoneDragRef.current = milestoneDrag;
  }, [milestoneDrag]);

  useEffect(() => {
    if (!isViewMenuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (!viewMenuRef.current?.contains(target)) {
        setIsViewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isViewMenuOpen]);

  // ── Memoized data ──
  const activeProjects = useMemo(() => {
    const f = getActiveProjects(filteredProjects);
    return showMilestonesOnly ? f.filter(isMilestoneProject) : f;
  }, [filteredProjects, showMilestonesOnly]);

  const allPersons = useMemo(
    () => getPersons(getActiveProjects(filteredProjects)),
    [filteredProjects],
  );

  const persons = useMemo(() => {
    if (!showMilestonesOnly) return allPersons;
    return allPersons.filter((p) =>
      activeProjects.some((pr) => pr.assignees.includes(p)),
    );
  }, [allPersons, activeProjects, showMilestonesOnly]);

  const personColorMap = useMemo(() => {
    const m = new Map<string, string>();
    persons.forEach((p, i) =>
      m.set(p, PERSON_COLORS[i % PERSON_COLORS.length]),
    );
    return m;
  }, [persons]);

  const orderIndexMap = useMemo(() => {
    const fallbackOrder = state.projects.map((p) => p.id);
    const orderedIds =
      state.projectOrder && state.projectOrder.length > 0
        ? state.projectOrder
        : fallbackOrder;
    const map = new Map<string, number>();
    orderedIds.forEach((id, idx) => map.set(id, idx));
    return map;
  }, [state.projectOrder, state.projects]);

  const sortProjectsByOrderMode = useCallback(
    (a: Project, b: Project) => {
      if (orderMode === 'custom') {
        const aIdx = orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (aIdx !== bIdx) return aIdx - bIdx;
      }
      const aTime = a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return (a.name || '').localeCompare(b.name || '');
    },
    [orderMode, orderIndexMap],
  );

  const groupedTimeline = useMemo(() => {
    const groups: TimelineGroup[] = [];

    if (groupMode === 'person') {
      persons.forEach((person) => {
        const list = activeProjects
          .filter((p) => p.assignees.includes(person))
          .sort(sortProjectsByOrderMode);
        groups.push({
          id: `person:${person}`,
          label: person,
          projects: list,
        });
      });
      return groups.filter((g) => g.projects.length > 0);
    }

    if (groupMode === 'type') {
      const byType = new Map<string, Project[]>();
      activeProjects.forEach((p) => {
        const key = (p.type || 'Sin tipo').trim() || 'Sin tipo';
        const list = byType.get(key) || [];
        list.push(p);
        byType.set(key, list);
      });
      [...byType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, list]) => {
          groups.push({
            id: `type:${key}`,
            label: key,
            projects: list.sort(sortProjectsByOrderMode),
          });
        });
      return groups;
    }

    if (groupMode === 'custom') {
      const byCustom = new Map<string, Project[]>();
      activeProjects.forEach((p) => {
        const key =
          customGroupField === 'branch'
            ? branchLabel(p.branch)
            : `Prioridad ${p.priority ?? 0}`;
        const normalized = (key || 'Sin valor').trim() || 'Sin valor';
        const list = byCustom.get(normalized) || [];
        list.push(p);
        byCustom.set(normalized, list);
      });
      [...byCustom.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, list]) => {
          groups.push({
            id: `custom:${key}`,
            label: key,
            projects: list.sort(sortProjectsByOrderMode),
          });
        });
      return groups;
    }

    return [
      {
        id: 'all',
        label: 'Todos',
        projects: [...activeProjects].sort(sortProjectsByOrderMode),
      },
    ];
  }, [
    groupMode,
    customGroupField,
    persons,
    activeProjects,
    sortProjectsByOrderMode,
  ]);

  const groupRootsMap = useMemo(() => {
    const map = new Map<string, HierarchyNode[]>();
    groupedTimeline.forEach((group) => {
      map.set(group.id, buildHierarchy(group.projects) as HierarchyNode[]);
    });
    return map;
  }, [groupedTimeline]);

  const range = useMemo(
    () => globalRange || getDateRange(activeProjects),
    [activeProjects, globalRange],
  );

  const timelineViewsStorageKey = useMemo(
    () => `workload-dashboard-timeline-views-${activeBoardId || 'default'}`,
    [activeBoardId],
  );

  const currentViewSnapshot = useMemo(
    () => ({
      groupMode,
      customGroupField,
      orderMode,
      colorMode,
      customColorField,
      showMilestonesOnly,
    }),
    [
      groupMode,
      customGroupField,
      orderMode,
      colorMode,
      customColorField,
      showMilestonesOnly,
    ],
  );

  // ── Derived ──
  const totalDays = range
    ? differenceInCalendarDays(range.end, range.start) + 1
    : 0;
  const baseDayWidth =
    totalDays > 0 ? Math.max(4, Math.min(20, 900 / totalDays)) : 10;
  const dayWidth = baseDayWidth * zoomScale;
  const timelineWidth = totalDays * dayWidth;

  const today = new Date();
  const todayOffset = range
    ? differenceInCalendarDays(today, range.start)
    : 0;
  const showTodayLine = range
    ? todayOffset >= 0 && todayOffset <= totalDays
    : false;

  const getTimelineViewWidth = useCallback(() => {
    const el = scrollContainerRef.current;
    return el ? Math.max(0, el.clientWidth - sidebarWidth) : 400;
  }, [sidebarWidth]);

  const clampedScrollX = clamp(
    scrollX,
    0,
    Math.max(0, timelineWidth - getTimelineViewWidth()),
  );
  const viewStartDay = dayWidth > 0 ? clampedScrollX / dayWidth : 0;
  const viewEndDay =
    dayWidth > 0
      ? Math.min(totalDays, viewStartDay + getTimelineViewWidth() / dayWidth)
      : totalDays;

  const dependencyNamesByProject = useMemo(() => {
    const byId = new Map(activeProjects.map((p) => [p.id, p]));
    const m = new Map<string, string[]>();
    activeProjects.forEach((p) => {
      const names = parseDependencyIds(p, activeProjects)
        .map((id) => byId.get(id)?.name || '')
        .filter(Boolean);
      m.set(p.id, names);
    });
    return m;
  }, [activeProjects]);

  const dependenciesAll = useMemo(() => {
    const deps: { from: Project; to: Project }[] = [];
    const byId = new Map(activeProjects.map((p) => [p.id, p]));
    activeProjects.forEach((proj) => {
      parseDependencyIds(proj, activeProjects).forEach((tid) => {
        const t = byId.get(tid);
        if (t && t.id !== proj.id) deps.push({ from: proj, to: t });
      });
    });
    return deps;
  }, [activeProjects]);

  const getBarPropsForProject = useCallback(
    (project: Project): BarProps | null => {
      if (!range) return null;
      return computeBarProps(
        project,
        range.start,
        totalDays,
        dayWidth,
        colorMode,
        customColorField,
        personColorMap,
      );
    },
    [range, totalDays, dayWidth, colorMode, customColorField, personColorMap],
  );

  // ═══════════════════════════════════════════════
  //  SCROLL / ZOOM HELPERS
  // ═══════════════════════════════════════════════

  const applyScrollToDOM = useCallback((value: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    suppressScrollRef.current = true;
    el.scrollLeft = value;
    requestAnimationFrame(() => {
      suppressScrollRef.current = false;
    });
  }, []);

  const zoomToDay = useCallback(
    (newZoom: number, anchorDay: number) => {
      const z = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
      const newDW = baseDayWidth * z;
      const viewW = getTimelineViewWidth();

      const anchorScreenX = anchorDay * dayWidth - clampedScrollX;
      const anchorRatio =
        viewW > 0 ? clamp(anchorScreenX / viewW, 0, 1) : 0.5;
      const newScrollX = anchorDay * newDW - anchorRatio * viewW;
      const maxScroll = Math.max(0, totalDays * newDW - viewW);
      const sx = clamp(newScrollX, 0, maxScroll);

      setActivePreset(null);
      setZoomScale(z);
      setScrollX(sx);
      applyScrollToDOM(sx);
    },
    [
      baseDayWidth,
      dayWidth,
      clampedScrollX,
      totalDays,
      getTimelineViewWidth,
      applyScrollToDOM,
    ],
  );

  const zoomCentered = useCallback(
    (newZoom: number) => {
      const center = (viewStartDay + viewEndDay) / 2;
      zoomToDay(newZoom, center);
    },
    [viewStartDay, viewEndDay, zoomToDay],
  );

  const applyPreset = useCallback(
    (preset: TimePreset) => {
      setActivePreset(preset);
      const viewW = getTimelineViewWidth();
      if (viewW <= 0 || !range || totalDays <= 0) return;

      if (preset === 'ALL') {
        const fitZoom = clamp(
          viewW / (totalDays * baseDayWidth),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        setZoomScale(fitZoom);
        setScrollX(0);
        applyScrollToDOM(0);
        return;
      }

      const targetDays = PRESET_DAYS[preset];
      if (targetDays === null) return;

      const newZoom = clamp(
        viewW / (targetDays * baseDayWidth),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const actualDW = baseDayWidth * newZoom;
      const centerDay = clamp(todayOffset, 0, totalDays);
      const maxScroll = Math.max(0, totalDays * actualDW - viewW);
      const sx = clamp(centerDay * actualDW - viewW / 2, 0, maxScroll);

      setZoomScale(newZoom);
      setScrollX(sx);
      applyScrollToDOM(sx);
    },
    [
      range,
      baseDayWidth,
      totalDays,
      todayOffset,
      getTimelineViewWidth,
      applyScrollToDOM,
    ],
  );

  useEffect(() => {
    if (!range || totalDays <= 0) return;
    applyPreset('ALL');
  }, [range, totalDays, applyPreset]);

  const panToDay = useCallback(
    (centerDay: number) => {
      const viewW = getTimelineViewWidth();
      const sx = clamp(
        centerDay * dayWidth - viewW / 2,
        0,
        Math.max(0, timelineWidth - viewW),
      );
      setScrollX(sx);
      applyScrollToDOM(sx);
    },
    [dayWidth, timelineWidth, getTimelineViewWidth, applyScrollToDOM],
  );

  // ═══════════════════════════════════════════════
  //  CALLBACKS
  // ═══════════════════════════════════════════════

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      n.has(groupId) ? n.delete(groupId) : n.add(groupId);
      return n;
    });
  }, []);

  const startEditName = useCallback((id: string, name: string) => {
    setEditingProjectId(id);
    setEditingProjectName(name || '');
  }, []);

  const commitEditName = useCallback(() => {
    if (!editingProjectId) return;
    const n = editingProjectName.trim();
    if (n)
      dispatch({
        type: 'UPDATE_PROJECT',
        payload: { id: editingProjectId, updates: { name: n } },
      });
    setEditingProjectId(null);
    setEditingProjectName('');
  }, [editingProjectId, editingProjectName, dispatch]);

  const cancelEditName = useCallback(() => {
    setEditingProjectId(null);
    setEditingProjectName('');
  }, []);

  const saveDeps = useCallback(
    (pid: string, ids: string[]) =>
      dispatch({
        type: 'UPDATE_PROJECT',
        payload: {
          id: pid,
          updates: { blocksTo: encodeDependencyIds(ids) },
        },
      }),
    [dispatch],
  );

  const toggleMilestone = useCallback(
    async (project: Project) => {
      if (!isMilestoneProject(project)) {
        const ok = await confirm({
          title: 'Convertir en hito',
          message: 'Ajustara fecha fin = inicio y duracion = 0. ¿Continuar?',
          confirmText: 'Convertir',
        });
        if (!ok) return;
        const d = project.startDate || project.endDate || new Date();
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: {
            id: project.id,
            updates: { startDate: d, endDate: d, daysRequired: 0 },
          },
        });
      } else {
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: { id: project.id, updates: { daysRequired: 1 } },
        });
      }
    },
    [dispatch, confirm],
  );

  const handleCreateProjectFrom = useCallback((source: Project) => {
    const anchor = source.startDate || source.endDate || new Date();
    const start = new Date(anchor);
    const end = source.endDate ? new Date(source.endDate) : new Date(anchor);
    const base: Project = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Nuevo proyecto',
      branch: source.branch || [],
      startDate: start,
      endDate: end,
      assignees: source.assignees || [],
      daysRequired: Math.max(1, Number(source.daysRequired || 1)),
      priority: source.priority || 1,
      type: source.type || 'Proyecto',
      blockedBy: null,
      blocksTo: null,
      reportedLoad: null,
      parentId: source.parentId || null,
      isExpanded: true,
      hierarchyLevel: source.hierarchyLevel || 0,
      assignedDays: 0,
      balanceDays: 0,
      dailyLoad: 0,
      totalHours: 0,
    };
    const withComputed = computeProjectFields(base, state.config, [...state.projects, base]);
    dispatch({
      type: 'ADD_PROJECT',
      payload: withComputed,
    });

    const currentOrder = (state.projectOrder && state.projectOrder.length > 0)
      ? [...state.projectOrder]
      : state.projects.map((p) => p.id);
    const sourceIndex = currentOrder.indexOf(source.id);
    const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : currentOrder.length;
    currentOrder.splice(insertIndex, 0, withComputed.id);
    dispatch({
      type: 'REORDER_PROJECTS',
      payload: currentOrder,
    });
  }, [dispatch, state.config, state.projects, state.projectOrder]);

  const handleDuplicateProjectFrom = useCallback((source: Project) => {
    const cloneBase: Project = {
      ...source,
      id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${source.name} (copia)`,
      startDate: source.startDate ? new Date(source.startDate) : null,
      endDate: source.endDate ? new Date(source.endDate) : null,
      isExpanded: true,
    };
    const withComputed = computeProjectFields(cloneBase, state.config, [...state.projects, cloneBase]);
    dispatch({
      type: 'ADD_PROJECT',
      payload: withComputed,
    });

    const currentOrder = (state.projectOrder && state.projectOrder.length > 0)
      ? [...state.projectOrder]
      : state.projects.map((p) => p.id);
    const sourceIndex = currentOrder.indexOf(source.id);
    const insertIndex = sourceIndex >= 0 ? sourceIndex + 1 : currentOrder.length;
    currentOrder.splice(insertIndex, 0, withComputed.id);
    dispatch({
      type: 'REORDER_PROJECTS',
      payload: currentOrder,
    });
  }, [dispatch, state.config, state.projects, state.projectOrder]);

  const handleDeleteProjectById = useCallback((projectId: string) => {
    void confirm({
      title: 'Eliminar proyecto',
      message: 'Esta accion no se puede deshacer.',
      confirmText: 'Eliminar',
      tone: 'danger',
    }).then((ok) => {
      if (!ok) return;
      dispatch({ type: 'DELETE_PROJECT', payload: projectId });
    });
  }, [confirm, dispatch]);

  const moveProjectByStep = useCallback((projectId: string, step: -1 | 1) => {
    const baseOrder =
      state.projectOrder && state.projectOrder.length > 0
        ? [...state.projectOrder]
        : state.projects.map((p) => p.id);
    const idx = baseOrder.indexOf(projectId);
    if (idx < 0) return;
    const target = idx + step;
    if (target < 0 || target >= baseOrder.length) return;
    const [moved] = baseOrder.splice(idx, 1);
    baseOrder.splice(target, 0, moved);
    dispatch({ type: 'REORDER_PROJECTS', payload: baseOrder });
    setOrderMode('custom');
  }, [dispatch, state.projectOrder, state.projects]);

  const handleMoveRowUp = useCallback((projectId: string) => {
    moveProjectByStep(projectId, -1);
  }, [moveProjectByStep]);

  const handleMoveRowDown = useCallback((projectId: string) => {
    moveProjectByStep(projectId, 1);
  }, [moveProjectByStep]);

  const applyTimelineView = useCallback((view: TimelineViewPreset) => {
    setGroupMode(view.groupMode);
    setCustomGroupField(view.customGroupField);
    setOrderMode(view.orderMode);
    setColorMode(view.colorMode);
    setCustomColorField(view.customColorField);
    setShowMilestonesOnly(view.showMilestonesOnly);
  }, []);

  const handleSelectTimelineView = useCallback((viewId: string) => {
    setActiveTimelineViewId(viewId);
    if (viewId === '__current__') return;
    const view = timelineViews.find((v) => v.id === viewId);
    if (view) applyTimelineView(view);
  }, [timelineViews, applyTimelineView]);

  const handleSaveTimelineView = useCallback(() => {
    if (activeTimelineViewId === '__current__') {
      const name = window.prompt('Nombre de la vista:');
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      const id = `tv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next: TimelineViewPreset = {
        id,
        name: trimmed,
        ...currentViewSnapshot,
      };
      setTimelineViews((prev) => [...prev, next]);
      setActiveTimelineViewId(id);
      return;
    }
    setTimelineViews((prev) =>
      prev.map((v) =>
        v.id === activeTimelineViewId ? { ...v, ...currentViewSnapshot } : v,
      ),
    );
  }, [activeTimelineViewId, currentViewSnapshot]);

  const handleSaveTimelineViewAs = useCallback(() => {
    const name = window.prompt('Guardar vista como:');
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const id = `tv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: TimelineViewPreset = {
      id,
      name: trimmed,
      ...currentViewSnapshot,
    };
    setTimelineViews((prev) => [...prev, next]);
    setActiveTimelineViewId(id);
  }, [currentViewSnapshot]);

  const handleDeleteTimelineView = useCallback(async () => {
    if (activeTimelineViewId === '__current__') return;
    const selected = timelineViews.find((v) => v.id === activeTimelineViewId);
    if (!selected) return;
    const ok = await confirm({
      title: 'Eliminar vista',
      message: `Se eliminara "${selected.name}".`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    setTimelineViews((prev) => prev.filter((v) => v.id !== activeTimelineViewId));
    setActiveTimelineViewId('__current__');
  }, [activeTimelineViewId, timelineViews, confirm]);

  const resetTimelineToolbar = useCallback(() => {
    setActiveTimelineViewId('__current__');
    setGroupMode('none');
    setCustomGroupField('branch');
    setOrderMode('chronological');
    setColorMode('type');
    setCustomColorField('branch');
    setShowMilestonesOnly(false);
  }, []);

  const activeToolbarChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (groupMode !== 'none') {
      chips.push({
        id: 'group',
        label:
          groupMode === 'none'
            ? 'Sin agrupar'
            : groupMode === 'type'
              ? 'Agrupar: Tipo'
              : 'Agrupar: Personalizado',
        onRemove: () => {
          setGroupMode('none');
          setCustomGroupField('branch');
        },
      });
    }
    if (groupMode === 'custom') {
      chips.push({
        id: 'group-custom',
        label: `Grupo por: ${customGroupField === 'branch' ? 'Sucursal' : 'Prioridad'}`,
        onRemove: () => setCustomGroupField('branch'),
      });
    }
    if (orderMode !== 'chronological') {
      chips.push({
        id: 'order',
        label: 'Orden: Personalizado',
        onRemove: () => setOrderMode('chronological'),
      });
    }
    if (colorMode !== 'type') {
      chips.push({
        id: 'color',
        label:
          colorMode === 'person'
            ? 'Color: Persona'
            : colorMode === 'type'
              ? 'Color: Tipo'
              : 'Color: Personalizado',
        onRemove: () => {
          setColorMode('type');
          setCustomColorField('branch');
        },
      });
    }
    if (colorMode === 'custom') {
      chips.push({
        id: 'color-custom',
        label: `Color por: ${customColorField === 'branch' ? 'Sucursal' : 'Tipo'}`,
        onRemove: () => setCustomColorField('branch'),
      });
    }
    if (activeTimelineViewId !== '__current__') {
      const selected = timelineViews.find((v) => v.id === activeTimelineViewId);
      chips.push({
        id: 'view',
        label: `Vista: ${selected?.name || 'Guardada'}`,
        onRemove: () => setActiveTimelineViewId('__current__'),
      });
    }
    return chips;
  }, [
    groupMode,
    customGroupField,
    orderMode,
    colorMode,
    customColorField,
    activeTimelineViewId,
    timelineViews,
  ]);

  const handleBarHover = useCallback(
    (e: React.MouseEvent, project: Project) => {
      const rect = tooltipContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        project,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const handleBarLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleStartBarResize = useCallback(
    (e: React.MouseEvent, project: Project, type: 'start' | 'end') => {
      e.preventDefault();
      e.stopPropagation();
      if (!project.startDate || !project.endDate) return;
      setBarResize({
        projectId: project.id,
        type,
        startX: e.clientX,
        originStart: new Date(project.startDate),
        originEnd: new Date(project.endDate),
        offsetDays: 0,
      });
    },
    [],
  );

  const handleStartMilestoneDrag = useCallback(
    (e: React.MouseEvent, project: Project) => {
      e.preventDefault();
      e.stopPropagation();
      const d = project.startDate || project.endDate;
      if (!d) return;
      setMilestoneDrag({
        projectId: project.id,
        startX: e.clientX,
        originDate: new Date(d),
        offsetDays: 0,
      });
    },
    [],
  );

  const startSidebarResize = useCallback(
    (e: React.MouseEvent) => {
      if (isSidebarCollapsed) return;
      e.preventDefault();
      e.stopPropagation();
      sidebarResizeRef.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
      };
      setIsSidebarResizing(true);
    },
    [sidebarWidth, isSidebarCollapsed],
  );

  const toggleSidebarCollapse = useCallback(() => {
    if (isSidebarCollapsed) {
      setSidebarWidth(clamp(sidebarExpandedWidthRef.current, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
      setIsSidebarCollapsed(false);
      return;
    }
    sidebarExpandedWidthRef.current = sidebarWidth;
    setSidebarWidth(56);
    setIsSidebarCollapsed(true);
  }, [isSidebarCollapsed, sidebarWidth]);

  // ═══════════════════════════════════════════════
  //  EFFECTS
  // ═══════════════════════════════════════════════

  // Drag cursor + prevent text selection
  useEffect(() => {
    if (barResize || milestoneDrag || isSidebarResizing) {
      document.body.style.cursor =
        barResize || milestoneDrag ? 'ew-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [barResize, milestoneDrag, isSidebarResizing]);

  // Sync state → DOM
  useEffect(() => {
    applyScrollToDOM(scrollX);
  }, [scrollX, applyScrollToDOM]);

  // Native scroll → state
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const h = () => {
      if (suppressScrollRef.current) return;
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() =>
        setScrollX(el.scrollLeft),
      );
    };
    el.addEventListener('scroll', h, { passive: true });
    return () => {
      el.removeEventListener('scroll', h);
      cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // Ctrl+Wheel zoom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - sidebarWidth + el.scrollLeft;
      const anchorDay = mouseX / dayWidth;

      const dir = e.deltaY < 0 ? 1 : -1;
      const factor = dir > 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
      zoomToDay(zoomScale * factor, anchorDay);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoomScale, dayWidth, sidebarWidth, zoomToDay]);

  // Milestone drag
  useEffect(() => {
    if (!milestoneDrag) return;
    const onMove = (e: MouseEvent) => {
      const off = Math.round((e.clientX - milestoneDrag.startX) / dayWidth);
      setMilestoneDrag((p) => (p ? { ...p, offsetDays: off } : p));
    };
    const onUp = () => {
      const s = milestoneDragRef.current;
      if (s && s.offsetDays !== 0) {
        const d = new Date(s.originDate);
        d.setDate(d.getDate() + s.offsetDays);
        dispatch({
          type: 'UPDATE_PROJECT',
          payload: {
            id: s.projectId,
            updates: { startDate: d, endDate: d },
          },
        });
      }
      setMilestoneDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [milestoneDrag, dayWidth, dispatch]);

  // Bar resize
  useEffect(() => {
    if (!barResize) return;
    const onMove = (e: MouseEvent) => {
      const off = Math.round((e.clientX - barResize.startX) / dayWidth);
      setBarResize((p) => (p ? { ...p, offsetDays: off } : p));
    };
    const onUp = () => {
      const s = barResizeRef.current;
      if (s && s.offsetDays !== 0) {
        const start = new Date(s.originStart);
        const end = new Date(s.originEnd);
        if (s.type === 'start') {
          start.setDate(start.getDate() + s.offsetDays);
        } else {
          end.setDate(end.getDate() + s.offsetDays);
        }
        if (start <= end) {
          dispatch({
            type: 'UPDATE_PROJECT',
            payload: {
              id: s.projectId,
              updates: { startDate: start, endDate: end },
            },
          });
        }
      }
      setBarResize(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [barResize, dayWidth, dispatch]);

  // Sidebar resize
  useEffect(() => {
    if (!isSidebarResizing) return;
    const onMove = (e: MouseEvent) => {
      if (!sidebarResizeRef.current) return;
      const d = e.clientX - sidebarResizeRef.current.startX;
      setSidebarWidth(
        clamp(
          sidebarResizeRef.current.startWidth + d,
          MIN_SIDEBAR_WIDTH,
          MAX_SIDEBAR_WIDTH,
        ),
      );
    };
    const onUp = () => {
      sidebarResizeRef.current = null;
      setIsSidebarResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isSidebarResizing]);

  // Invalidate tree geometry after DOM updates
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      invalidateTree();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeProjects, groupedTimeline, sidebarWidth, collapsedGroups, invalidateTree]);

  // Timeline views persistence by board
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(timelineViewsStorageKey);
      if (!raw) {
        setTimelineViews([]);
        setActiveTimelineViewId('__current__');
        return;
      }
      const parsed = JSON.parse(raw) as {
        views?: TimelineViewPreset[];
        activeId?: string;
      };
      const views = Array.isArray(parsed?.views) ? parsed.views : [];
      const activeId = parsed?.activeId || '__current__';
      setTimelineViews(views);
      setActiveTimelineViewId(activeId);
      const activeView = views.find((v) => v.id === activeId);
      if (activeView) {
        setGroupMode(activeView.groupMode);
        setCustomGroupField(activeView.customGroupField);
        setOrderMode(activeView.orderMode);
        setColorMode(activeView.colorMode);
        setCustomColorField(activeView.customColorField);
        setShowMilestonesOnly(activeView.showMilestonesOnly);
      }
    } catch {
      setTimelineViews([]);
      setActiveTimelineViewId('__current__');
    }
  }, [timelineViewsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        timelineViewsStorageKey,
        JSON.stringify({
          views: timelineViews,
          activeId: activeTimelineViewId,
        }),
      );
    } catch {
      // Ignore persistence failures
    }
  }, [timelineViewsStorageKey, timelineViews, activeTimelineViewId]);

  // ═══════════════════════════════════════════════
  //  EARLY RETURN
  // ═══════════════════════════════════════════════
  if (!range || activeProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <CalendarRange size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay proyectos con fechas</p>
        <p className="text-xs mt-1">
          Agrega fechas a los proyectos para ver el timeline.
        </p>
      </div>
    );
  }

  // ── Year and Month headers ──
  const years: { label: string; startOffset: number; width: number }[] = [];
  const months: { label: string; startOffset: number; width: number }[] = [];
  let curYear = -1,
    yStart = 0,
    curMonth = -1,
    mStart = 0;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(range.start.getTime() + i * 86400000);
    const year = d.getFullYear();
    const m = d.getMonth() + year * 12;

    if (year !== curYear) {
      if (years.length) years[years.length - 1].width = i - yStart;
      years.push({ label: year.toString(), startOffset: i, width: 0 });
      yStart = i;
      curYear = year;
    }

    if (m !== curMonth) {
      if (months.length) months[months.length - 1].width = i - mStart;
      months.push({ label: format(d, 'MMM'), startOffset: i, width: 0 });
      mStart = i;
      curMonth = m;
    }
  }
  if (years.length) years[years.length - 1].width = totalDays - yStart;
  if (months.length) months[months.length - 1].width = totalDays - mStart;

  const movableOrderRange = (() => {
    const indices = activeProjects
      .map((p) => orderIndexMap.get(p.id))
      .filter((v): v is number => typeof v === 'number');
    if (indices.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...indices), max: Math.max(...indices) };
  })();

  const indentStepPx = 12;

  // ═══════════════════════════════════════════════
  //  RENDER HELPERS
  // ═══════════════════════════════════════════════

  const renderTree = (
    nodes: HierarchyNode[],
    pList: Project[],
    level = 0,
  ): React.ReactNode[] => {
    const items: React.ReactNode[] = [];
    for (const n of nodes) {
      const ns = state.projects.find((p) => p.id === n.id);
      const exp = ns?.isExpanded ?? true;
      const hasKids = isParent(n.id, pList);
      const depsFor = dependenciesAll.filter((d) => d.from.id === n.id);
      const depNames = dependencyNamesByProject.get(n.id) || [];

      items.push(
        <GanttRow
          key={n.id}
          node={n}
          pList={pList}
          level={level}
          sidebarWidth={sidebarWidth}
          dayWidth={dayWidth}
          timelineWidth={timelineWidth}
          todayOffset={todayOffset}
          showTodayLine={showTodayLine}
          getBarProps={getBarPropsForProject}
          dependencies={depsFor}
          dependencyNames={depNames}
          barResize={barResize}
          milestoneDrag={milestoneDrag}
          editingProjectId={editingProjectId}
          editingProjectName={editingProjectName}
          isExpanded={exp}
          hasChildren={hasKids}
          isMilestone={isMilestoneProject(n)}
          onBarHover={handleBarHover}
          onBarLeave={handleBarLeave}
          onStartEditName={startEditName}
          onEditNameChange={setEditingProjectName}
          onCommitEditName={commitEditName}
          onCancelEditName={cancelEditName}
          onToggleExpansion={(id) =>
            dispatch({ type: 'TOGGLE_EXPANSION', payload: id })
          }
          onToggleMilestone={toggleMilestone}
          onOpenDependencyEditor={setDependencyEditorProjectId}
          onStartBarResize={handleStartBarResize}
          onStartMilestoneDrag={handleStartMilestoneDrag}
          onCreateProjectFrom={handleCreateProjectFrom}
          onDuplicateProjectFrom={handleDuplicateProjectFrom}
          onDeleteProjectById={handleDeleteProjectById}
          onMoveRowUp={handleMoveRowUp}
          onMoveRowDown={handleMoveRowDown}
          canMoveUp={(orderIndexMap.get(n.id) ?? -1) > movableOrderRange.min}
          canMoveDown={(orderIndexMap.get(n.id) ?? -1) < movableOrderRange.max}
          isSidebarCollapsed={isSidebarCollapsed}
          rowRef={treeRegisterRow(n.id)}
        />,
      );
      if (n.children?.length && exp)
        items.push(...renderTree(n.children, pList, level + 1));
    }
    return items;
  };

  // ═══════════════════════════════════════════════
  //  JSX
  // ═══════════════════════════════════════════════
  return (
    <div className="p-2 flex-1 overflow-hidden flex flex-col">
      {/* ── Toolbar ── */}
      <div className="mb-2 space-y-1">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <ToolbarDropdownWithActions
            value={activeTimelineViewId}
            onChange={(v) => handleSelectTimelineView(v)}
            options={[
              { value: '__current__', label: 'Sin vista' },
              ...timelineViews.map(v => ({ value: v.id, label: v.name })),
            ]}
            icon={TOOLBAR_ICONS.view}
            placeholder="Vista"
            actions={[
              {
                label: 'Guardar vista actual',
                onClick: () => handleSaveTimelineView(),
                icon: <Save size={14} />,
              },
              {
                label: 'Nueva vista',
                onClick: () => handleSaveTimelineViewAs(),
                variant: 'primary',
                icon: <Plus size={14} />,
              },
            ]}
          />

          <ToolbarDropdown
            value={groupMode}
            onChange={(v) => setGroupMode(v as GroupMode)}
            options={[
              { value: 'none', label: 'Sin agrupar' },
              { value: 'person', label: 'Por persona' },
              { value: 'type', label: 'Por tipo' },
              { value: 'custom', label: 'Personalizado' },
            ]}
            icon={TOOLBAR_ICONS.group}
            secondaryOptions={groupMode === 'custom' ? [
              { value: 'branch', label: 'Sucursal' },
              { value: 'priority', label: 'Prioridad' },
            ] : undefined}
            secondaryValue={customGroupField}
            onSecondaryChange={(v) => setCustomGroupField(v as CustomGroupField)}
            placeholder="Agrupar"
          />

          <ToolbarDropdown
            value={orderMode}
            onChange={(v) => setOrderMode(v as OrderMode)}
            options={[
              { value: 'chronological', label: 'Cronológico' },
              { value: 'custom', label: 'Personalizado' },
            ]}
            icon={TOOLBAR_ICONS.order}
            placeholder="Orden"
          />

          <ToolbarDropdown
            value={colorMode}
            onChange={(v) => setColorMode(v as ColorMode)}
            options={[
              { value: 'load', label: 'Por carga' },
              { value: 'person', label: 'Por persona' },
              { value: 'type', label: 'Por tipo' },
              { value: 'custom', label: 'Personalizado' },
            ]}
            icon={TOOLBAR_ICONS.color}
            secondaryOptions={colorMode === 'custom' ? [
              { value: 'branch', label: 'Sucursal' },
              { value: 'type', label: 'Tipo' },
            ] : undefined}
            secondaryValue={customColorField}
            onSecondaryChange={(v) => setCustomColorField(v as CustomColorField)}
            placeholder="Colorear"
          />
          {(activeToolbarChips.length > 0 || showMilestonesOnly) && (
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
            {activeToolbarChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={chip.onRemove}
                style={{
                  height: '24px',
                  borderRadius: DIMENSIONS.radius.full,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  padding: '0 8px',
                  fontSize: '11px',
                  color: COLORS.textSecondary,
                  cursor: 'pointer',
                  transition: `all ${TRANSITIONS.hover}`,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.bgMuted;
                  e.currentTarget.style.color = COLORS.text;
                  e.currentTarget.style.borderColor = COLORS.borderSubtle;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.bg;
                  e.currentTarget.style.color = COLORS.textSecondary;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                {chip.label}
                <span style={{
                  fontSize: '10px',
                  opacity: 0.7,
                }}>×</span>
              </button>
            ))}
            {showMilestonesOnly && (
              <button
                type="button"
                onClick={() => setShowMilestonesOnly(false)}
                style={{
                  height: '24px',
                  borderRadius: DIMENSIONS.radius.full,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bg,
                  padding: '0 8px',
                  fontSize: '11px',
                  color: COLORS.textSecondary,
                  cursor: 'pointer',
                  transition: `all ${TRANSITIONS.hover}`,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.bgMuted;
                  e.currentTarget.style.color = COLORS.text;
                  e.currentTarget.style.borderColor = COLORS.borderSubtle;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.bg;
                  e.currentTarget.style.color = COLORS.textSecondary;
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              >
                Solo hitos
                <span style={{
                  fontSize: '10px',
                  opacity: 0.7,
                }}>×</span>
              </button>
            )}
            <button
              type="button"
              onClick={resetTimelineToolbar}
              style={{
                height: '24px',
                borderRadius: DIMENSIONS.radius.full,
                border: `1px solid ${COLORS.danger}`,
                background: COLORS.bg,
                padding: '0 8px',
                fontSize: '11px',
                color: COLORS.danger,
                cursor: 'pointer',
                transition: `all ${TRANSITIONS.hover}`,
                fontFamily: TYPOGRAPHY.fontFamily,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.dangerSoft;
                e.currentTarget.style.borderColor = COLORS.danger;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.bg;
                e.currentTarget.style.borderColor = COLORS.danger;
              }}
            >
              Limpiar todo
            </button>
          </div>
        )}
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Timeline */}
        <div
          ref={tooltipContainerRef}
          className="bg-white rounded-xl border border-border overflow-hidden flex-1 min-h-0 relative isolate"
        >
          <div ref={scrollContainerRef} className="overflow-auto h-full">
            <div style={{ minWidth: timelineWidth + sidebarWidth }}>
              {/* ── HEADER ── */}
              <div className="sticky top-0 z-30 border-b border-border bg-white">
                {/* Row 1: Sidebar label + Years */}
                <div className="flex">
                  <div
                    className="px-3 py-1.5 bg-white border-r border-b border-border text-xs font-semibold text-text-secondary sticky left-0 z-40 relative flex items-center"
                    style={{
                      width: sidebarWidth,
                      minWidth: sidebarWidth,
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggleSidebarCollapse}
                      className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded text-text-secondary hover:bg-bg-secondary"
                      title={isSidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
                    >
                      {isSidebarCollapsed ? <ChevronsRight size={12} /> : <ChevronsLeft size={12} />}
                    </button>
                    {!isSidebarCollapsed && (groupMode === 'none' ? 'Proyecto' : 'Grupo / Proyecto')}
                    <div
                      onMouseDown={startSidebarResize}
                      className={`absolute right-0 top-0 h-full w-2 transition-colors ${isSidebarCollapsed ? 'cursor-default' : 'cursor-col-resize hover:bg-blue-100/40'}`}
                    >
                      <div className="mx-auto h-full w-px bg-text-secondary/20" />
                    </div>
                  </div>
                  <div className="flex relative flex-1 border-b border-border">
                    {years.map((y, i) => (
                      <div
                        key={i}
                        className="text-[11px] font-bold text-text-primary px-2 py-1.5 border-r border-border bg-bg-secondary/70 text-center flex-shrink-0"
                        style={{
                          width: y.width * dayWidth,
                          minWidth: y.width * dayWidth,
                        }}
                      >
                        {y.width * dayWidth > 40 ? y.label : ''}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Row 2: Empty sidebar space + Months */}
                <div className="flex">
                  <div
                    className="border-r border-border bg-white sticky left-0 z-40"
                    style={{
                      width: sidebarWidth,
                      minWidth: sidebarWidth,
                    }}
                  />
                  <div className="flex relative flex-1">
                    {months.map((m, i) => (
                      <div
                        key={i}
                        className="text-[10px] font-medium text-text-secondary px-2 py-1.5 border-r border-border bg-bg-secondary/30 text-center capitalize flex-shrink-0"
                        style={{
                          width: m.width * dayWidth,
                          minWidth: m.width * dayWidth,
                        }}
                      >
                        {m.width * dayWidth > 45 ? m.label : ''}
                      </div>
                    ))}
                    {/* Today line in header */}
                    {showTodayLine && (
                      <>
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10 pointer-events-none"
                          style={{ left: todayOffset * dayWidth }}
                        />
                        <div
                          className="absolute top-1/2 w-3 h-3 bg-blue-400 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                          style={{ left: todayOffset * dayWidth }}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── GROUPS ── */}
              {groupedTimeline.map((group, gi) => {
                const pList = group.projects;
                const collapsed = collapsedGroups.has(group.id);
                const pColor = PERSON_COLORS[gi % PERSON_COLORS.length];
                const roots = (groupRootsMap.get(group.id) || []) as HierarchyNode[];

                if (groupMode === 'none') {
                  return (
                    <div
                      key={group.id}
                      ref={treeRegisterGroupHost(group.id)}
                      className="relative"
                    >
                      {renderTree(roots, pList)}
                      <GanttTreeOverlay
                        projects={pList}
                        rowRefs={treeRowRefs}
                        groupHostRefs={treeGroupHostRefs} groupId={group.id}
                        step={indentStepPx}
                        version={treeVersion}
                        className="stroke-neutral-300/75"
                      />
                    </div>
                  );
                }

                return (
                  <div key={group.id}>
                    <div
                      className="flex items-center border-b border-border bg-bg-secondary cursor-pointer hover:bg-bg-secondary transition-colors"
                      onClick={() => toggleGroup(group.id)}
                    >
                      <div
                        className="px-3 py-2 border-r border-border flex items-center gap-2 sticky left-0 z-30 bg-bg-secondary"
                        style={{
                          width: sidebarWidth,
                          minWidth: sidebarWidth,
                        }}
                      >
                        {collapsed ? (
                          <ChevronRight size={14} className="text-text-secondary" />
                        ) : (
                          <ChevronDown size={14} className="text-text-secondary" />
                        )}
                        {groupMode === 'person' ? (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                            style={{ backgroundColor: pColor }}
                          >
                            {(() => {
                              const avatarUrl = getAvatarUrl(group.label);
                              return avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt={group.label}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                group.label.charAt(0)
                              );
                            })()}
                          </div>
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ backgroundColor: '#E2E8F0', color: '#475569' }}
                          >
                            {group.label.charAt(0)}
                          </div>
                        )}
                        <span className="text-sm font-semibold text-text-primary truncate flex-1">
                          {group.label}
                        </span>
                        <span className="text-[10px] text-text-secondary bg-white px-1.5 py-0.5 rounded-full ml-auto">
                          {pList.length}
                        </span>
                      </div>
                      <div className="flex-1 relative h-8">
                        {collapsed &&
                          pList.map((proj) => {
                            const b = getBarPropsForProject(proj);
                            if (!b) return null;
                            return (
                              <div
                                key={proj.id}
                                className="absolute top-1 h-6 rounded-md"
                                style={{
                                  left: b.left,
                                  width: b.width,
                                  background: b.style.bg,
                                  border: `1px solid ${b.style.preview}`,
                                  opacity: 0.7,
                                }}
                              />
                            );
                          })}
                        {showTodayLine && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-blue-400/50 pointer-events-none"
                            style={{ left: todayOffset * dayWidth }}
                          />
                        )}
                      </div>
                    </div>
                    {!collapsed && (
                      <div
                        ref={treeRegisterGroupHost(group.id)}
                        className="relative"
                      >
                        {renderTree(roots, pList)}
                        <GanttTreeOverlay
                          projects={pList}
                          rowRefs={treeRowRefs}
                          groupHostRefs={treeGroupHostRefs} groupId={group.id}
                          step={indentStepPx}
                          version={treeVersion}
                          className="stroke-neutral-300/75"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tooltip */}
          {tooltip && (
            <GanttTooltip
              project={tooltip.project}
              x={tooltip.x}
              y={tooltip.y}
              sidebarWidth={sidebarWidth}
              containerWidth={tooltipContainerRef.current?.clientWidth ?? 0}
              containerHeight={
                tooltipContainerRef.current?.clientHeight ?? 0
              }
              dependencyNames={
                dependencyNamesByProject.get(tooltip.project.id) || []
              }
            />
          )}
        </div>

        {/* ─── NAVIGATION BAR (Apple/shadcn/ui Style) ─── */}
        <div style={{
          marginTop: '8px',
          flexShrink: 0,
        }}>
          {/* Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            {/* Presets - PillGroup Style */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              padding: '3px',
              background: COLORS.bgMuted,
              borderRadius: DIMENSIONS.radius.sm,
              border: `1px solid ${COLORS.border}`,
            }}>
              {(Object.keys(PRESET_DAYS) as TimePreset[]).map((preset) => {
                const isActive = activePreset === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: `all ${TRANSITIONS.hover}`,
                      background: isActive ? COLORS.bg : 'transparent',
                      boxShadow: isActive ? SHADOWS.sm : 'none',
                      color: isActive ? COLORS.text : COLORS.textTertiary,
                      fontSize: '11px',
                      fontWeight: isActive ? 500 : 400,
                      fontFamily: TYPOGRAPHY.fontFamily,
                      minWidth: '28px',
                    }}
                  >
                    {PRESET_LABELS[preset]}
                  </button>
                );
              })}
            </div>

            <div style={{
              width: '1px',
              height: '20px',
              background: COLORS.border,
            }} />

            {/* Navigation */}
            <button
              onClick={() =>
                panToDay(
                  viewStartDay - (viewEndDay - viewStartDay) * 0.5,
                )
              }
              style={{
                height: DIMENSIONS.iconButtonSizeSm,
                width: DIMENSIONS.iconButtonSizeSm,
                borderRadius: DIMENSIONS.radius.sm,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                transition: `all ${TRANSITIONS.hover}`,
                fontFamily: TYPOGRAPHY.fontFamily,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.bgMuted;
                e.currentTarget.style.color = COLORS.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.bg;
                e.currentTarget.style.color = COLORS.textSecondary;
              }}
              title="Retroceder"
            >
              <ChevronsLeft size={14} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => panToDay(todayOffset)}
              style={{
                padding: '0 10px',
                height: DIMENSIONS.iconButtonSizeSm,
                borderRadius: DIMENSIONS.radius.sm,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: COLORS.textSecondary,
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: `all ${TRANSITIONS.hover}`,
                fontFamily: TYPOGRAPHY.fontFamily,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.bgMuted;
                e.currentTarget.style.color = COLORS.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.bg;
                e.currentTarget.style.color = COLORS.textSecondary;
              }}
              title="Ir a hoy"
            >
              Hoy
            </button>
            <button
              onClick={() =>
                panToDay(
                  viewEndDay + (viewEndDay - viewStartDay) * 0.5,
                )
              }
              style={{
                height: DIMENSIONS.iconButtonSizeSm,
                width: DIMENSIONS.iconButtonSizeSm,
                borderRadius: DIMENSIONS.radius.sm,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                transition: `all ${TRANSITIONS.hover}`,
                fontFamily: TYPOGRAPHY.fontFamily,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.bgMuted;
                e.currentTarget.style.color = COLORS.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.bg;
                e.currentTarget.style.color = COLORS.textSecondary;
              }}
              title="Avanzar"
            >
              <ChevronsRight size={14} strokeWidth={1.5} />
            </button>

            <div style={{
              width: '1px',
              height: '20px',
              background: COLORS.border,
            }} />

            {/* Zoom Slider */}
            <ZoomSlider zoom={zoomScale} onChange={zoomCentered} />

            {/* Zoom percentage */}
            <span style={{
              fontSize: '11px',
              color: COLORS.textTertiary,
              fontVariantNumeric: 'tabular-nums',
              minWidth: '40px',
              textAlign: 'center',
              fontFamily: TYPOGRAPHY.fontFamily,
            }}>
              {Math.round(zoomScale * 100)}%
            </span>

            {/* Date range */}
            <span style={{
              marginLeft: 'auto',
              fontSize: '11px',
              color: COLORS.textTertiary,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: TYPOGRAPHY.fontFamily,
            }}>
              {format(
                addDays(range.start, Math.floor(viewStartDay)),
                'dd MMM',
              )}
              {' — '}
              {format(
                addDays(
                  range.start,
                  Math.floor(viewEndDay)
                ),
                'dd MMM',
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Dependencies modal */}
      {dependencyEditorProjectId && (
        <DependenciesModal
          projectId={dependencyEditorProjectId}
          projects={activeProjects}
          selectedIds={(() => {
            const s = activeProjects.find(
              (p) => p.id === dependencyEditorProjectId,
            );
            return s ? parseDependencyIds(s, activeProjects) : [];
          })()}
          onClose={() => setDependencyEditorProjectId(null)}
          onSave={(ids) => {
            saveDeps(dependencyEditorProjectId, ids);
            setDependencyEditorProjectId(null);
          }}
        />
      )}
    </div>
  );
}
