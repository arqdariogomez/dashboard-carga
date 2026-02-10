import { useMemo, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { Toggle } from '@/components/shared/Toggle';
import { DateRangeSlider } from '@/components/shared/DateRangeSlider';
import { aggregateByPeriod, getPersons } from '@/lib/workloadEngine';
import { isParent, aggregateFromChildren } from '@/lib/hierarchyEngine';
import { format, isSameDay, addMonths, addWeeks, addDays, startOfMonth, startOfWeek, isToday, eachDayOfInterval, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import type { Granularity, ProjectLoad, Project } from '@/lib/types';
import { getLoadColor, PERSON_COLORS } from '@/lib/constants';
import { isWorkingDay } from '@/lib/dateUtils';

interface DetailPanel {
  person: string;
  periodStart: Date;
  periodEnd: Date;
  load: number;
  projects: ProjectLoad[];
}

export function WorkloadGrid() {
  const { state, dispatch, filteredProjects, workloadData, dateRange } = useProject();
  const [viewStart, setViewStart] = useState<Date | null>(null);
  const [detailPanel, setDetailPanel] = useState<DetailPanel | null>(null);
  const [showDateSlider, setShowDateSlider] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);

  const persons = useMemo(() => {
    const ps = getPersons(filteredProjects);
    return state.filters.persons.length > 0 ? ps.filter(p => state.filters.persons.includes(p)) : ps;
  }, [filteredProjects, state.filters.persons]);

  // Calculate visible date range based on granularity
  const visibleRange = useMemo(() => {
    if (!dateRange) return null;
    const start = viewStart || dateRange.start;
    let end: Date;
    switch (state.granularity) {
      case 'day':
        end = addDays(start, 30); // Show ~1 month of days
        break;
      case 'week':
        end = addWeeks(start, 12); // Show ~3 months of weeks
        break;
      case 'month':
        end = addMonths(start, 8); // Show ~8 months
        break;
    }
    // Don't exceed the project range
    const effectiveEnd = end > dateRange.end ? dateRange.end : end;
    const effectiveStart = start < dateRange.start ? dateRange.start : start;
    return { start: effectiveStart, end: effectiveEnd };
  }, [dateRange, viewStart, state.granularity]);

  // Build grid data
  const gridData = useMemo(() => {
    if (!visibleRange) return new Map<string, ReturnType<typeof aggregateByPeriod>>();
    const result = new Map<string, ReturnType<typeof aggregateByPeriod>>();
    persons.forEach((person) => {
      const wl = workloadData.get(person) || [];
      const filtered = wl.filter(w => w.date >= visibleRange.start && w.date <= visibleRange.end);
      const agg = aggregateByPeriod(filtered, state.granularity, visibleRange, state.config);
      result.set(person, agg);
    });
    return result;
  }, [persons, workloadData, visibleRange, state.granularity, state.config]);

  // Build column headers
  interface ColumnHeader {
    label: string;
    sublabel?: string;
    date: Date;
    isToday?: boolean;
    isWeekend?: boolean;
  }

  const columns = useMemo(() => {
    const emptyResult = { headers: [] as ColumnHeader[], monthGroups: [] as { label: string; span: number }[] };
    if (!visibleRange) return emptyResult;

    if (state.granularity === 'day') {
      const days = eachDayOfInterval({ start: visibleRange.start, end: visibleRange.end })
        .filter(d => isWorkingDay(d, state.config));
      const headers: ColumnHeader[] = days.map(d => ({
        label: format(d, 'd'),
        sublabel: format(d, 'EEE', { locale: es }).slice(0, 2),
        date: d,
        isToday: isToday(d),
        isWeekend: [0, 6].includes(getDay(d)),
      }));
      const monthGroups: { label: string; span: number }[] = [];
      let currentMonth = '';
      headers.forEach(h => {
        const m = format(h.date, 'MMMM yyyy', { locale: es });
        if (m !== currentMonth) {
          monthGroups.push({ label: m, span: 1 });
          currentMonth = m;
        } else {
          monthGroups[monthGroups.length - 1].span++;
        }
      });
      return { headers, monthGroups };
    }

    if (state.granularity === 'week') {
      const firstPerson = Array.from(gridData.values())[0];
      if (!firstPerson) return emptyResult;
      const headers: ColumnHeader[] = firstPerson.map((d, i) => ({
        label: `S${i + 1}`,
        sublabel: format(d.start, 'dd MMM', { locale: es }),
        date: d.start,
        isToday: false,
      }));
      const monthGroups: { label: string; span: number }[] = [];
      let currentMonth = '';
      headers.forEach(h => {
        const m = format(h.date, 'MMM yyyy', { locale: es });
        if (m !== currentMonth) {
          monthGroups.push({ label: m, span: 1 });
          currentMonth = m;
        } else {
          monthGroups[monthGroups.length - 1].span++;
        }
      });
      return { headers, monthGroups };
    }

    // Month
    const firstPerson = Array.from(gridData.values())[0];
    if (!firstPerson) return emptyResult;
    const headers: ColumnHeader[] = firstPerson.map(d => ({
      label: format(d.start, 'MMM yy', { locale: es }),
      date: d.start,
      isToday: false,
    }));
    return { headers, monthGroups: [] };
  }, [visibleRange, state.granularity, state.config, gridData]);

  // Navigate
  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (!dateRange) return;
    if (direction === 'today') {
      const today = new Date();
      switch (state.granularity) {
        case 'day': setViewStart(addDays(today, -5)); break;
        case 'week': setViewStart(startOfWeek(today, { weekStartsOn: 1 })); break;
        case 'month': setViewStart(startOfMonth(today)); break;
      }
      return;
    }
    const current = viewStart || dateRange.start;
    const delta = direction === 'prev' ? -1 : 1;
    switch (state.granularity) {
      case 'day': setViewStart(addDays(current, delta * 14)); break;
      case 'week': setViewStart(addWeeks(current, delta * 4)); break;
      case 'month': setViewStart(addMonths(current, delta * 3)); break;
    }
  }, [dateRange, viewStart, state.granularity]);

  // Range label
  const rangeLabel = useMemo(() => {
    if (!visibleRange) return '';
    const startStr = format(visibleRange.start, 'MMMM yyyy', { locale: es });
    const endStr = format(visibleRange.end, 'MMMM yyyy', { locale: es });
    if (startStr === endStr) return startStr.charAt(0).toUpperCase() + startStr.slice(1);
    return `${startStr.charAt(0).toUpperCase() + startStr.slice(1)} — ${endStr.charAt(0).toUpperCase() + endStr.slice(1)}`;
  }, [visibleRange]);

  // Team total row
  const teamTotals = useMemo(() => {
    if (columns.headers.length === 0 || persons.length === 0) return [];
    return columns.headers.map((_, colIdx) => {
      let totalLoad = 0;
      let count = 0;
      persons.forEach(person => {
        const data = gridData.get(person);
        if (data && data[colIdx]) {
          totalLoad += data[colIdx].avgLoad;
          count++;
        }
      });
      return count > 0 ? totalLoad / count : 0;
    });
  }, [columns.headers, persons, gridData]);

  const handleCellClick = useCallback((person: string, colIdx: number) => {
    const data = gridData.get(person);
    if (!data || !data[colIdx]) return;
    const cell = data[colIdx];
    setDetailPanel({
      person,
      periodStart: cell.start,
      periodEnd: cell.end,
      load: cell.avgLoad,
      projects: cell.projects,
    });
  }, [gridData]);

  // Find full project details for the detail panel
  const detailProjects = useMemo(() => {
    if (!detailPanel) return [];
    return detailPanel.projects.map(pl => {
      const fullProject = filteredProjects.find(p => p.id === pl.projectId);
      if (!fullProject) return { ...pl, fullProject: undefined };

      // If the project is a parent in the currently visible set, aggregate visible children
      if (isParent(fullProject.id, filteredProjects)) {
        const aggregated = aggregateFromChildren(fullProject.id, filteredProjects, state.config);
        const merged: Project = { ...fullProject, ...aggregated } as Project;
        return { ...pl, fullProject: merged };
      }

      return { ...pl, fullProject };
    });
  }, [detailPanel, filteredProjects]);

  if (persons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <Calendar size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay datos para mostrar</p>
        <p className="text-xs mt-1">Verifica los filtros activos o carga un archivo.</p>
      </div>
    );
  }

  const colWidth = state.granularity === 'day' ? 'min-w-[44px] w-[44px]' : state.granularity === 'week' ? 'min-w-[64px] w-[64px]' : 'min-w-[80px] w-[80px]';

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main grid area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Controls bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <Toggle
              size="sm"
              options={[
                { value: 'day', label: 'Día' },
                { value: 'week', label: 'Semana' },
                { value: 'month', label: 'Mes' },
              ]}
              value={state.granularity}
              onChange={(v) => dispatch({ type: 'SET_GRANULARITY', payload: v as Granularity })}
            />

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate('prev')}
                className="p-1.5 rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigate('today')}
                className="px-2.5 py-1 text-xs font-medium rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => navigate('next')}
                className="p-1.5 rounded-md hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Date range slider toggle */}
            <button
              onClick={() => setShowDateSlider(!showDateSlider)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showDateSlider
                  ? 'bg-accent-blue text-white'
                  : 'hover:bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
              title="Mostrar/ocultar selector de rango de fechas"
            >
              <Calendar size={14} className="inline mr-1" />
              Fechas
            </button>
          </div>

          <div className="text-xs font-medium text-text-secondary capitalize">
            {rangeLabel}
          </div>
        </div>

        {/* Date Range Slider */}
        {showDateSlider && dateRange && (
          <div className="px-4 py-3 bg-white border-b border-border flex-shrink-0">
            <DateRangeSlider
              min={dateRange.start}
              max={dateRange.end}
              value={customRange || dateRange}
              onChange={(range) => {
                setCustomRange(range);
                setViewStart(range.start);
              }}
              label="Rango de visualización"
            />
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-fit">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20">
                {/* Month group row */}
                {columns.monthGroups.length > 0 && (
                  <tr>
                    <th className="sticky left-0 z-30 bg-white border-b border-r border-border w-[200px] min-w-[200px]" />
                    {columns.monthGroups.map((group, i) => (
                      <th
                        key={i}
                        colSpan={group.span}
                        className="bg-bg-secondary/80 backdrop-blur-sm border-b border-border px-2 py-1.5 text-[11px] font-semibold text-text-primary text-center capitalize"
                      >
                        {group.label}
                      </th>
                    ))}
                  </tr>
                )}

                {/* Day/period headers */}
                <tr>
                  <th className="sticky left-0 z-30 bg-white border-b border-r border-border px-4 py-2 text-left text-xs font-semibold text-text-secondary w-[200px] min-w-[200px]">
                    Persona
                  </th>
                  {columns.headers.map((col, i) => (
                    <th
                      key={i}
                      className={`bg-white/95 backdrop-blur-sm border-b border-border px-1 py-1.5 text-center ${colWidth} ${
                        col.isToday ? 'bg-accent-blue/30' : ''
                      }`}
                    >
                      <div className={`text-[11px] font-medium ${col.isToday ? 'text-person-1 font-bold' : 'text-text-secondary'}`}>
                        {col.label}
                      </div>
                      {col.sublabel && (
                        <div className={`text-[9px] ${col.isToday ? 'text-person-1' : 'text-text-secondary/60'}`}>
                          {col.sublabel}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {persons.map((person, personIdx) => {
                  const personData = gridData.get(person) || [];
                  const avgLoad = personData.length > 0
                    ? personData.reduce((sum, d) => sum + d.avgLoad, 0) / personData.length
                    : 0;
                  const activeCount = filteredProjects.filter(
                    (p) => p.assignees.includes(person) && p.startDate && p.endDate
                  ).length;
                  const personColor = PERSON_COLORS[personIdx % PERSON_COLORS.length];

                  return (
                    <tr key={person} className="group hover:bg-bg-secondary/30 transition-colors">
                      {/* Person info - sticky column */}
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-bg-secondary/30 border-b border-r border-border px-4 py-3 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: personColor }}
                          >
                            {person.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{person}</div>
                            <div className="text-[10px] text-text-secondary mt-0.5">
                              {activeCount} proyectos · <span className="tabular-nums">{Math.round(avgLoad * 100)}%</span> prom.
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Data cells */}
                      {personData.map((cell, colIdx) => {
                        const isSelected = detailPanel?.person === person &&
                          isSameDay(detailPanel.periodStart, cell.start);
                        const colHeader = columns.headers[colIdx];
                        const isTodayCol = colHeader?.isToday;

                        return (
                          <td
                            key={colIdx}
                            className={`border-b border-border px-0.5 py-1.5 text-center ${colWidth} transition-colors ${
                              isTodayCol ? 'bg-accent-blue/10' : ''
                            } ${isSelected ? 'bg-accent-blue/20 ring-1 ring-inset ring-person-1/30' : ''}`}
                          >
                            <div className="flex items-center justify-center">
                              <LoadBubble
                                load={cell.avgLoad}
                                size={state.granularity === 'day' ? 'sm' : 'md'}
                                projects={cell.projects}
                                dateLabel={`${format(cell.start, 'dd MMM', { locale: es })}${!isSameDay(cell.start, cell.end) ? ` — ${format(cell.end, 'dd MMM', { locale: es })}` : ''}`}
                                onClick={() => handleCellClick(person, colIdx)}
                              />
                            </div>
                          </td>
                        );
                      })}

                      {/* Fill empty columns */}
                      {personData.length < columns.headers.length &&
                        Array.from({ length: columns.headers.length - personData.length }).map((_, i) => (
                          <td key={`empty-${i}`} className={`border-b border-border ${colWidth}`} />
                        ))
                      }
                    </tr>
                  );
                })}

                {/* Team total row */}
                <tr className="bg-bg-secondary/50">
                  <td className="sticky left-0 z-10 bg-bg-secondary/50 border-r border-border px-4 py-2.5">
                    <div className="text-xs font-semibold text-text-secondary">Equipo promedio</div>
                  </td>
                  {teamTotals.map((total, i) => {
                    const color = getLoadColor(total);
                    const percentage = Math.round(total * 100);
                    return (
                      <td key={i} className={`border-border px-1 py-2 text-center ${colWidth}`}>
                        <div
                          className="text-[10px] font-bold tabular-nums rounded-sm px-1 py-0.5 mx-auto inline-block"
                          style={{ backgroundColor: color.bg, color: color.text }}
                        >
                          {percentage}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Panel (slides in from right) */}
      {detailPanel && (
        <DetailSidePanel
          panel={detailPanel}
          projects={detailProjects}
          onClose={() => setDetailPanel(null)}
        />
      )}
    </div>
  );
}

function DetailSidePanel({
  panel,
  projects,
  onClose,
}: {
  panel: DetailPanel;
  projects: { projectId: string; projectName: string; dailyLoad: number; fullProject?: Project }[];
  onClose: () => void;
}) {
  const color = getLoadColor(panel.load);
  const percentage = Math.round(panel.load * 100);
  const isSingleDay = isSameDay(panel.periodStart, panel.periodEnd);

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-border bg-white overflow-y-auto slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{panel.person}</h3>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {isSingleDay
              ? format(panel.periodStart, "dd 'de' MMMM, yyyy", { locale: es })
              : `${format(panel.periodStart, 'dd MMM', { locale: es })} — ${format(panel.periodEnd, 'dd MMM yyyy', { locale: es })}`
            }
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-bg-secondary transition-colors text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Load summary */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${color.bg}, ${color.bg}dd)`, border: `2px solid ${color.text}30` }}
          >
            <span className="text-lg font-bold tabular-nums" style={{ color: color.text }}>
              {percentage}%
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary">Carga total</div>
            <div className="text-xs text-text-secondary mt-0.5">
              {projects.length} proyecto{projects.length !== 1 ? 's' : ''} activo{projects.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Load bar */}
        <div className="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(percentage, 100)}%`,
              backgroundColor: color.text,
              opacity: 0.5,
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-text-secondary">0%</span>
          <span className="text-[10px] text-text-secondary">100%</span>
        </div>
      </div>

      {/* Project list */}
      <div className="px-4 py-3">
        <h4 className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wider">Proyectos</h4>
        <div className="space-y-2">
          {projects.map((p) => {
            const loadPct = Math.round(p.dailyLoad * 100);
            const pColor = getLoadColor(p.dailyLoad);
            return (
              <div key={p.projectId} className="bg-bg-secondary rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary truncate">{p.projectName}</div>
                    {p.fullProject && (
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {p.fullProject.branch}
                        {p.fullProject.type !== 'Proyecto' && ` · ${p.fullProject.type}`}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                    style={{ backgroundColor: pColor.bg, color: pColor.text }}
                  >
                    {loadPct}%
                  </span>
                </div>

                {p.fullProject && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-text-secondary">
                    <div>
                      <span className="font-medium">Inicio: </span>
                      {p.fullProject.startDate ? format(p.fullProject.startDate, 'dd/MM/yy') : '—'}
                    </div>
                    <div>
                      <span className="font-medium">Fin: </span>
                      {p.fullProject.endDate ? format(p.fullProject.endDate, 'dd/MM/yy') : '—'}
                    </div>
                    <div>
                      <span className="font-medium">Días req: </span>
                      {p.fullProject.daysRequired}
                    </div>
                    <div>
                      <span className="font-medium">Balance: </span>
                      <span className={p.fullProject.balanceDays >= 0 ? 'text-[#2D6A2E]' : 'text-[#B71C1C]'}>
                        {p.fullProject.balanceDays > 0 ? '+' : ''}{p.fullProject.balanceDays}d
                      </span>
                    </div>
                  </div>
                )}

                {/* Contribution bar */}
                <div className="mt-2 w-full h-1 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(loadPct, 100)}%`,
                      backgroundColor: pColor.text,
                      opacity: 0.4,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {projects.length === 0 && (
          <div className="text-sm text-text-secondary italic py-4 text-center">
            Sin proyectos en este periodo
          </div>
        )}
      </div>
    </div>
  );
}
