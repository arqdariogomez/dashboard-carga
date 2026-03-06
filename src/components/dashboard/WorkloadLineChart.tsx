import { useEffect, useMemo, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons } from '@/lib/workloadEngine';
import { PERSON_COLORS } from '@/lib/constants';
import { format, isToday, startOfDay, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LineChart as LineChartIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Building,
  Tag,
  Clock,
  Calendar,
  Home,
  Target,
} from 'lucide-react';

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Brush,
} from 'recharts';

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function findClosestDateIndex(
  chartData: Array<{ date: string }>,
  target: Date
): number {
  const targetStr = format(target, 'yyyy-MM-dd');
  const exact = chartData.findIndex((d) => d.date === targetStr);
  if (exact >= 0) return exact;

  let closestDiff = Infinity;
  let closestIdx = -1;
  const targetTime = target.getTime();

  for (let i = 0; i < chartData.length; i++) {
    const diff = Math.abs(new Date(chartData[i].date).getTime() - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

type GroupByOption = 'person' | 'branch' | 'type' | 'status';

interface DayDetails {
  date: Date;
  projects: Array<{
    id: string;
    name: string;
    assignee: string;
    branch?: string;
    type?: string;
    priority: 'low' | 'medium' | 'high';
    startDate: Date;
    endDate: Date;
  }>;
}

/* ────────────────────────────────────────────
   Shared style tokens (inline, no Tailwind needed)
   ──────────────────────────────────────────── */

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const COLORS = {
  bg: '#FFFFFF',
  bgSubtle: '#F9FAFB',
  bgMuted: '#F3F4F6',
  border: 'rgba(0,0,0,0.06)',
  borderLight: 'rgba(0,0,0,0.04)',
  text: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  accent: '#3B82F6',
  accentHover: '#2563EB',
  accentSoft: '#EFF6FF',
  accentBorder: '#BFDBFE',
};

const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

/* ────────────────────────────────────────────
   Tiny reusable button component (inline)
   ──────────────────────────────────────────── */

function PillButton({
  active = false,
  accent = false,
  children,
  onClick,
  disabled = false,
  style,
}: {
  active?: boolean;
  accent?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: FONT_STACK,
    lineHeight: '20px',
    borderRadius: RADIUS.sm,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap' as const,
    opacity: disabled ? 0.4 : 1,
    ...style,
  };

  const variant: React.CSSProperties = active
    ? {
        background: accent ? COLORS.accent : COLORS.accent,
        color: '#fff',
        boxShadow: '0 1px 2px rgba(59,130,246,0.25)',
      }
    : {
        background: 'transparent',
        color: COLORS.textSecondary,
      };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variant }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = COLORS.bgMuted;
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.text;
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.textSecondary;
        }
      }}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────
   Icon button (circular / ghost)
   ──────────────────────────────────────────── */

function IconButton({
  children,
  onClick,
  disabled = false,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: RADIUS.sm,
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'all 0.18s ease',
        color: COLORS.textTertiary,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = COLORS.bgMuted;
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.text;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.textTertiary;
        }
      }}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────── */

export function WorkloadLineChart() {
  const { state, filteredProjects, workloadData, dateRange } = useProject();
  const [visibleRange, setVisibleRange] = useState<{
    startIndex: number;
    endIndex: number;
  } | null>(null);
  const [yMode, setYMode] = useState<'auto' | '200' | '300'>('auto');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByOption>('person');

  const persons = useMemo(() => {
    const ps = getPersons(filteredProjects);
    return state.filters.persons.length > 0
      ? ps.filter((p) => state.filters.persons.includes(p))
      : ps;
  }, [filteredProjects, state.filters.persons]);

  const chartData = useMemo(() => {
    if (!dateRange || persons.length === 0) return [];

    const dateMap = new Map<string, Record<string, number | boolean>>();

    persons.forEach((person) => {
      const wl = workloadData.get(person) || [];
      wl.forEach((w) => {
        const key = format(w.date, 'yyyy-MM-dd');
        if (!dateMap.has(key)) {
          dateMap.set(key, { isToday: isToday(w.date) ? 1 : 0 });
        }
        const entry = dateMap.get(key)!;
        entry[person] = Math.round(w.totalLoad * 100);
      });
    });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dataByDate]) => ({
        date: key,
        label: format(new Date(key), 'dd MMM', { locale: es }),
        ...dataByDate,
      }));
  }, [persons, workloadData, dateRange]);

  useEffect(() => {
    if (chartData.length === 0) {
      setVisibleRange(null);
      return;
    }
    setVisibleRange((prev) => {
      if (!prev) {
        const start = Math.max(
          0,
          chartData.length - Math.min(45, chartData.length)
        );
        return { startIndex: start, endIndex: chartData.length - 1 };
      }
      const startIndex = Math.max(
        0,
        Math.min(prev.startIndex, chartData.length - 1)
      );
      const endIndex = Math.max(
        startIndex,
        Math.min(prev.endIndex, chartData.length - 1)
      );
      if (startIndex === prev.startIndex && endIndex === prev.endIndex)
        return prev;
      return { startIndex, endIndex };
    });
  }, [chartData.length]);

  const visibleDays = visibleRange
    ? visibleRange.endIndex - visibleRange.startIndex + 1
    : chartData.length;
  const canRenderDots = visibleDays <= 70;
  const yDomain =
    yMode === 'auto'
      ? ([0, 'auto'] as const)
      : ([0, Number(yMode)] as const);

  const todayLabel = useMemo(() => {
    const todayEntry = chartData.find(
      (d) => (d as any).isToday === 1
    );
    return todayEntry?.label || null;
  }, [chartData]);

  const navigateToDate = useCallback(
    (targetDate: Date) => {
      const targetIndex = findClosestDateIndex(chartData, targetDate);
      if (targetIndex >= 0) {
        setSelectedDate(new Date(chartData[targetIndex].date));
        const halfWindow = 22;
        const startIndex = Math.max(0, targetIndex - halfWindow);
        const endIndex = Math.min(
          chartData.length - 1,
          targetIndex + halfWindow
        );
        setVisibleRange({ startIndex, endIndex });
      }
    },
    [chartData]
  );

  const dayDetails = useMemo((): DayDetails | null => {
    if (!selectedDate || !filteredProjects.length) return null;

    const sel = startOfDay(selectedDate).getTime();

    const projects = filteredProjects
      .filter((project) => {
        if (!project.startDate || !project.endDate) return false;
        const start = startOfDay(new Date(project.startDate)).getTime();
        const end = startOfDay(new Date(project.endDate)).getTime();
        return sel >= start && sel <= end;
      })
      .map((project) => ({
        id: project.id,
        name: project.name,
        assignee:
          Array.isArray(project.assignees) && project.assignees.length > 0
            ? project.assignees[0]
            : 'Sin asignar',
        branch: Array.isArray(project.branch)
          ? project.branch[0]
          : project.branch,
        type: project.type,
        priority:
          project.priority === 1
            ? 'low'
            : project.priority === 2
            ? 'medium'
            : 'high',
        startDate: new Date(project.startDate!),
        endDate: new Date(project.endDate!),
      }));

    return { date: selectedDate, projects };
  }, [selectedDate, filteredProjects]);

  const handleChartClick = useCallback((data: any) => {
    console.log('🔍 Debug - Chart click data:', data);
    if (data?.activePayload?.[0]?.payload?.date) {
      const dateStr = data.activePayload[0].payload.date;
      console.log('🔍 Debug - Date string:', dateStr);
      const date = new Date(dateStr);
      console.log('🔍 Debug - Parsed date:', date);
      if (!isNaN(date.getTime())) {
        console.log('🔍 Debug - Setting selected date:', date);
        setSelectedDate(date);
      }
    } else {
      console.log('🔍 Debug - No active payload or date found');
    }
  }, []);

  const navigateDay = useCallback(
    (direction: 'prev' | 'next') => {
      if (!selectedDate || !chartData.length) return;
      const currentIndex = chartData.findIndex(
        (d) => d.date === format(selectedDate, 'yyyy-MM-dd')
      );
      let newIndex = currentIndex;
      if (direction === 'prev' && currentIndex > 0) {
        newIndex = currentIndex - 1;
      } else if (
        direction === 'next' &&
        currentIndex < chartData.length - 1
      ) {
        newIndex = currentIndex + 1;
      }
      if (
        newIndex !== currentIndex &&
        newIndex >= 0 &&
        newIndex < chartData.length
      ) {
        setSelectedDate(new Date(chartData[newIndex].date));
      }
    },
    [selectedDate, chartData]
  );

  const selectedDateIndex = useMemo(() => {
    if (!selectedDate) return -1;
    return chartData.findIndex(
      (d) => d.date === format(selectedDate, 'yyyy-MM-dd')
    );
  }, [selectedDate, chartData]);

  /* ── Empty state ── */
  if (chartData.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 280,
          fontFamily: FONT_STACK,
          color: COLORS.textTertiary,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: RADIUS.lg,
            background: COLORS.bgSubtle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <LineChartIcon size={28} color={COLORS.textTertiary} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          No hay datos para el gráfico
        </p>
        <p
          style={{
            fontSize: 13,
            marginTop: 6,
            fontWeight: 400,
            color: COLORS.textTertiary,
          }}
        >
          Verifica los filtros activos o carga un archivo.
        </p>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'row',
        fontFamily: FONT_STACK,
        gap: 0,
      }}
    >
      {/* ─── Chart panel ─── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.bg,
          borderRadius: RADIUS.xl,
          border: `1px solid ${COLORS.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
          padding: 24,
          overflow: 'hidden',
        }}
      >
        {/* ─── Toolbar ─── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          {/* Scale controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 3,
              background: COLORS.bgSubtle,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderLight}`,
            }}
          >
            {(['auto', '200', '300'] as const).map((mode) => (
              <PillButton
                key={mode}
                active={yMode === mode}
                onClick={() => setYMode(mode)}
              >
                {mode === 'auto' ? 'Auto' : `${mode}%`}
              </PillButton>
            ))}

            <div
              style={{
                width: 1,
                height: 20,
                background: COLORS.border,
                margin: '0 4px',
              }}
            />

            <PillButton
              onClick={() => {
                if (chartData.length === 0) return;
                setVisibleRange({
                  startIndex: 0,
                  endIndex: chartData.length - 1,
                });
              }}
            >
              <Target size={14} />
              Ajustar
            </PillButton>
          </div>

          {/* Quick navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 3,
              background: COLORS.bgSubtle,
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderLight}`,
            }}
          >
            <PillButton
              active
              accent
              onClick={() => navigateToDate(new Date())}
            >
              <Home size={14} />
              Hoy
            </PillButton>
            <PillButton
              onClick={() => navigateToDate(subDays(new Date(), 14))}
            >
              <Calendar size={14} />
              2S
            </PillButton>
            <PillButton
              onClick={() => navigateToDate(subMonths(new Date(), 1))}
            >
              1M
            </PillButton>
            <PillButton
              onClick={() => navigateToDate(subMonths(new Date(), 3))}
            >
              3M
            </PillButton>
            <PillButton
              onClick={() =>
                navigateToDate(
                  chartData.length > 0
                    ? new Date(chartData[0].date)
                    : new Date()
                )
              }
            >
              Todo
            </PillButton>
          </div>

          {/* Person legend */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {persons.map((person, i) => (
              <div
                key={person}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  background: COLORS.bgSubtle,
                  borderRadius: RADIUS.full,
                  border: `1px solid ${COLORS.borderLight}`,
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.textSecondary,
                  letterSpacing: '-0.01em',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: RADIUS.full,
                    background:
                      PERSON_COLORS[i % PERSON_COLORS.length],
                    boxShadow: `0 0 0 2px ${COLORS.bg}, 0 0 0 3px ${PERSON_COLORS[i % PERSON_COLORS.length]}40`,
                  }}
                />
                {person}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Chart container ─── */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.borderLight}`,
            background: COLORS.bg,
            padding: '16px 12px 8px 4px',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: 'none',
          }}
          onClick={(e) => {
            // Fallback: si el clic no viene del gráfico, intentar obtener la fecha más cercana
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const width = rect.width;
            
            if (chartData.length > 0) {
              const index = Math.floor((x / width) * chartData.length);
              const clampedIndex = Math.max(0, Math.min(index, chartData.length - 1));
              const selectedData = chartData[clampedIndex];
              if (selectedData?.date) {
                console.log('🔍 Debug - Fallback click, index:', clampedIndex, 'date:', selectedData.date);
                setSelectedDate(new Date(selectedData.date));
              }
            }
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.boxShadow = 'none';
          }}
          tabIndex={-1}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 16, right: 20, left: 8, bottom: 16 }}
              onClick={handleChartClick}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#E5E7EB"
                strokeOpacity={0.45}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{
                  fontSize: 11,
                  fill: COLORS.textTertiary,
                  fontFamily: FONT_STACK,
                  fontWeight: 500,
                }}
                tickLine={false}
                axisLine={{ stroke: COLORS.border, strokeWidth: 1 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{
                  fontSize: 11,
                  fill: COLORS.textTertiary,
                  fontFamily: FONT_STACK,
                  fontWeight: 500,
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={yDomain}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.98)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  fontSize: 12,
                  fontFamily: FONT_STACK,
                  boxShadow:
                    '0 8px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                  padding: '12px 16px',
                  backdropFilter: 'blur(12px)',
                }}
                formatter={(value: any, name: any) => [
                  `${value}%`,
                  name,
                ]}
                labelFormatter={(label) => label}
              />
              <ReferenceLine
                y={100}
                stroke="#F59E0B"
                strokeDasharray="8 4"
                strokeWidth={1.5}
                strokeOpacity={0.7}
                label={{
                  value: '100%',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#F59E0B',
                  fontFamily: FONT_STACK,
                  fontWeight: 600,
                }}
              />
              {todayLabel && (
                <ReferenceLine
                  x={todayLabel}
                  stroke="#EF4444"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  strokeOpacity={0.8}
                  label={{
                    value: 'HOY',
                    position: 'top',
                    fontSize: 10,
                    fill: '#EF4444',
                    fontFamily: FONT_STACK,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                />
              )}
              {selectedDate && (
                <ReferenceLine
                  x={format(selectedDate, 'dd MMM', { locale: es })}
                  stroke={COLORS.accent}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  strokeOpacity={0.7}
                  label={{
                    value: '●',
                    position: 'top',
                    fontSize: 12,
                    fill: COLORS.accent,
                    fontFamily: FONT_STACK,
                    fontWeight: 600,
                  }}
                />
              )}
              {persons.map((person, i) => (
                <Line
                  key={person}
                  type="monotone"
                  dataKey={person}
                  stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                  strokeWidth={2}
                  dot={
                    canRenderDots
                      ? {
                          r: 2.5,
                          fill: PERSON_COLORS[i % PERSON_COLORS.length],
                          strokeWidth: 2,
                          stroke: '#fff',
                        }
                      : false
                  }
                  activeDot={{
                    r: 6,
                    strokeWidth: 3,
                    stroke: '#fff',
                    fill: PERSON_COLORS[i % PERSON_COLORS.length],
                    style: {
                      filter: `drop-shadow(0 2px 4px ${PERSON_COLORS[i % PERSON_COLORS.length]}40)`,
                    },
                  }}
                  isAnimationActive={false}
                />
              ))}
              {visibleRange && (
                <Brush
                  dataKey="label"
                  height={28}
                  startIndex={visibleRange.startIndex}
                  endIndex={visibleRange.endIndex}
                  onChange={(next) => {
                    if (
                      typeof next?.startIndex === 'number' &&
                      typeof next?.endIndex === 'number'
                    ) {
                      setVisibleRange({
                        startIndex: next.startIndex,
                        endIndex: next.endIndex,
                      });
                    }
                  }}
                  travellerWidth={12}
                  stroke="#D1D5DB"
                  fill={COLORS.bgSubtle}
                  fillOpacity={0.6}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Sidebar detail panel ─── */}
      {selectedDate && dayDetails && (
        <div
          style={{
            width: 380,
            background: COLORS.bg,
            borderLeft: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.03)',
            fontFamily: FONT_STACK,
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              padding: '24px 24px 20px',
              borderBottom: `1px solid ${COLORS.borderLight}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: COLORS.textTertiary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    margin: '0 0 4px',
                  }}
                >
                  Detalle del día
                </p>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    color: COLORS.text,
                    margin: 0,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.3,
                  }}
                >
                  {format(selectedDate, "d 'de' MMMM, yyyy", {
                    locale: es,
                  })}
                </h3>
              </div>
              <IconButton
                onClick={() => setSelectedDate(null)}
                label="Cerrar"
              >
                <X size={16} />
              </IconButton>
            </div>

            {/* Day navigation */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <IconButton
                onClick={() => navigateDay('prev')}
                disabled={selectedDateIndex <= 0}
                label="Día anterior"
              >
                <ChevronLeft size={16} />
              </IconButton>

              <div
                style={{
                  padding: '6px 16px',
                  background: COLORS.accentSoft,
                  border: `1px solid ${COLORS.accentBorder}`,
                  borderRadius: RADIUS.full,
                  fontSize: 13,
                  fontWeight: 600,
                  color: COLORS.accent,
                  letterSpacing: '-0.01em',
                }}
              >
                {dayDetails.projects.length} proyecto
                {dayDetails.projects.length !== 1 ? 's' : ''}
              </div>

              <IconButton
                onClick={() => navigateDay('next')}
                disabled={
                  selectedDateIndex < 0 ||
                  selectedDateIndex >= chartData.length - 1
                }
                label="Día siguiente"
              >
                <ChevronRight size={16} />
              </IconButton>
            </div>

            {/* Group-by selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: COLORS.textTertiary,
                }}
              >
                Agrupar:
              </span>
              <select
                value={groupBy}
                onChange={(e) =>
                  setGroupBy(e.target.value as GroupByOption)
                }
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: FONT_STACK,
                  padding: '6px 32px 6px 12px',
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm,
                  color: COLORS.text,
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none' as const,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%239CA3AF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                <option value="person">Persona</option>
                <option value="branch">Sucursal</option>
                <option value="type">Tipo</option>
              </select>
            </div>
          </div>

          {/* Project list */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 24,
            }}
          >
            {dayDetails.projects.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  paddingTop: 48,
                  paddingBottom: 48,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    background: COLORS.bgMuted,
                    borderRadius: RADIUS.lg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <Calendar size={22} color={COLORS.textTertiary} />
                </div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: COLORS.textSecondary,
                    margin: 0,
                  }}
                >
                  Sin proyectos
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: COLORS.textTertiary,
                    marginTop: 4,
                  }}
                >
                  Selecciona otra fecha
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {dayDetails.projects.map((project) => {
                  const priorityConfig = {
                    high: {
                      bg: '#FEF2F2',
                      color: '#DC2626',
                      border: '#FECACA',
                      label: 'Alta',
                    },
                    medium: {
                      bg: '#FFFBEB',
                      color: '#D97706',
                      border: '#FDE68A',
                      label: 'Media',
                    },
                    low: {
                      bg: '#F0FDF4',
                      color: '#16A34A',
                      border: '#BBF7D0',
                      label: 'Baja',
                    },
                  }[project.priority];

                  const metaItems = [
                    {
                      icon: <Users size={14} />,
                      iconBg: '#EFF6FF',
                      iconColor: '#3B82F6',
                      label: project.assignee,
                      show: true,
                    },
                    {
                      icon: <Building size={14} />,
                      iconBg: '#F5F3FF',
                      iconColor: '#8B5CF6',
                      label: project.branch,
                      show: !!project.branch,
                    },
                    {
                      icon: <Tag size={14} />,
                      iconBg: '#ECFDF5',
                      iconColor: '#10B981',
                      label: project.type,
                      show: !!project.type,
                    },
                    {
                      icon: <Clock size={14} />,
                      iconBg: '#FFF7ED',
                      iconColor: '#F97316',
                      label: `${format(project.startDate, 'd MMM', { locale: es })} — ${format(project.endDate, 'd MMM', { locale: es })}`,
                      show: true,
                    },
                  ].filter((m) => m.show);

                  return (
                    <div
                      key={project.id}
                      style={{
                        padding: 16,
                        background: COLORS.bgSubtle,
                        borderRadius: RADIUS.md,
                        border: `1px solid ${COLORS.borderLight}`,
                        transition: 'all 0.2s ease',
                        cursor: 'default',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor =
                          'rgba(0,0,0,0.1)';
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          '0 2px 8px rgba(0,0,0,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor =
                          COLORS.borderLight;
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          'none';
                      }}
                    >
                      {/* Project header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          marginBottom: 12,
                          gap: 12,
                        }}
                      >
                        <h4
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: COLORS.text,
                            margin: 0,
                            lineHeight: 1.4,
                            letterSpacing: '-0.01em',
                            flex: 1,
                          }}
                        >
                          {project.name}
                        </h4>
                        <span
                          style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: RADIUS.full,
                            background: priorityConfig.bg,
                            color: priorityConfig.color,
                            border: `1px solid ${priorityConfig.border}`,
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.02em',
                            lineHeight: '18px',
                          }}
                        >
                          {priorityConfig.label}
                        </span>
                      </div>

                      {/* Meta rows */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        {metaItems.map((meta, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: RADIUS.sm,
                                background: meta.iconBg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: meta.iconColor,
                                flexShrink: 0,
                              }}
                            >
                              {meta.icon}
                            </div>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: COLORS.text,
                                letterSpacing: '-0.01em',
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}