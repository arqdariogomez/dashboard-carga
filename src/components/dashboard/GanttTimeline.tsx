import { useMemo, useState, useRef, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons, getActiveProjects } from '@/lib/workloadEngine';
import { buildHierarchy, isParent } from '@/lib/hierarchyEngine';
import { getDateRange, format } from '@/lib/dateUtils';
import { differenceInCalendarDays } from 'date-fns';
import { getLoadColor, PERSON_COLORS } from '@/lib/constants';
import { ChevronDown, ChevronRight, CalendarRange } from 'lucide-react';
import type { Project } from '@/lib/types';

interface TooltipData {
  project: Project;
  x: number;
  y: number;
}

export function GanttTimeline() {
  const { state, dispatch, filteredProjects, dateRange: globalRange } = useProject();
  const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeProjects = useMemo(() => getActiveProjects(filteredProjects), [filteredProjects]);
  const persons = useMemo(() => getPersons(activeProjects), [activeProjects]);

  // Precompute per-person hierarchical roots to avoid hooks inside render loops
  const personRootsMap = useMemo(() => {
    const map = new Map<string, any[]>();
    persons.forEach((person) => {
      const list = activeProjects
        .filter((p) => p.assignees.includes(person))
        .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()));
      map.set(person, buildHierarchy(list));
    });
    return map;
  }, [activeProjects, persons]);

  const range = useMemo(() => {
    return globalRange || getDateRange(activeProjects);
  }, [activeProjects, globalRange]);

  const togglePerson = useCallback((p: string) => {
    setCollapsedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  if (!range || activeProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <CalendarRange size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay proyectos con fechas</p>
        <p className="text-xs mt-1">Agrega fechas a los proyectos para ver el timeline.</p>
      </div>
    );
  }

  const totalDays = differenceInCalendarDays(range.end, range.start) + 1;
  const dayWidth = Math.max(4, Math.min(20, 900 / totalDays));
  const today = new Date();
  const todayOffset = differenceInCalendarDays(today, range.start);
  const showTodayLine = todayOffset >= 0 && todayOffset <= totalDays;

  // Month headers
  const months: { label: string; startOffset: number; width: number }[] = [];
  let currentMonth = -1;
  let monthStart = 0;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(range.start.getTime() + i * 86400000);
    const m = d.getMonth() + d.getFullYear() * 12;
    if (m !== currentMonth) {
      if (months.length > 0) {
        months[months.length - 1].width = i - monthStart;
      }
      months.push({
        label: format(d, 'MMM yyyy'),
        startOffset: i,
        width: 0,
      });
      monthStart = i;
      currentMonth = m;
    }
  }
  if (months.length > 0) {
    months[months.length - 1].width = totalDays - monthStart;
  }

  const getBarProps = (project: Project) => {
    if (!project.startDate || !project.endDate) return null;
    const startOff = differenceInCalendarDays(project.startDate, range.start);
    const endOff = differenceInCalendarDays(project.endDate, range.start) + 1;
    const left = Math.max(0, startOff) * dayWidth;
    const width = (Math.min(endOff, totalDays) - Math.max(0, startOff)) * dayWidth;
    const color = getLoadColor(project.dailyLoad);
    return { left, width: Math.max(width, 3), color, startOff, endOff };
  };

  // Build dependency lines
  const dependencies = useMemo(() => {
    const deps: { from: Project; to: Project }[] = [];
    activeProjects.forEach(proj => {
      if (proj.blocksTo) {
        const target = activeProjects.find(p => p.name === proj.blocksTo);
        if (target) deps.push({ from: proj, to: target });
      }
    });
    return deps;
  }, [activeProjects]);

  const handleBarHover = useCallback((e: React.MouseEvent, project: Project) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      project,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const timelineWidth = totalDays * dayWidth;
  const sidebarWidth = 200;

  return (
    <div className="p-4 flex-1 overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="bg-white rounded-xl border border-border overflow-hidden flex-1 relative"
      >
        <div className="overflow-auto h-full">
          <div style={{ minWidth: timelineWidth + sidebarWidth }}>
            {/* Month headers */}
            <div className="flex sticky top-0 z-20 border-b border-border">
              <div className="w-[200px] min-w-[200px] px-3 py-2.5 bg-white border-r border-border text-xs font-semibold text-text-secondary sticky left-0 z-30">
                Persona / Proyecto
              </div>
              <div className="flex relative">
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="text-[11px] font-semibold text-text-primary px-2 py-2.5 border-r border-border bg-bg-secondary/50 text-center capitalize"
                    style={{ width: m.width * dayWidth }}
                  >
                    {m.width * dayWidth > 50 ? m.label : ''}
                  </div>
                ))}

                {/* Today line in header */}
                {showTodayLine && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-400 today-line z-10"
                    style={{ left: todayOffset * dayWidth }}
                  />
                )}
              </div>
            </div>

            {/* Person groups */}
            {persons.map((person, personIdx) => {
              const personProjectList = activeProjects
                .filter((p) => p.assignees.includes(person))
                .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()));
              const isCollapsed = collapsedPersons.has(person);
              const personColor = PERSON_COLORS[personIdx % PERSON_COLORS.length];

              // Build hierarchical nodes for this person's projects
              const roots = personRootsMap.get(person) || [];

              const renderNode = (node: Project, level = 0) => {
                const bar = getBarProps(node as Project);
                if (!bar) return null;

                const nodeState = state.projects.find(p => p.id === node.id);
                const expanded = nodeState?.isExpanded ?? true;
                const hasChildren = isParent(node.id, personProjectList);
                const dep = dependencies.find(d => d.from.id === node.id);

                return (
                  <div key={node.id} className="flex border-b border-border hover:bg-bg-secondary/20 transition-colors group/bar">
                    <div className="w-[200px] min-w-[200px] px-3 py-2 border-r border-border sticky left-0 z-10 bg-white group-hover/bar:bg-bg-secondary/20 transition-colors">
                      <div className="flex items-center">
                        <div style={{ paddingLeft: level * 12 }} className="min-w-0">
                          {hasChildren && (
                            <button
                              onClick={() => dispatch({ type: 'TOGGLE_EXPANSION', payload: node.id })}
                              className="mr-2 text-text-secondary"
                              aria-label={expanded ? 'Contraer' : 'Expandir'}
                            >
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                          <div className="text-xs text-text-primary truncate inline-block align-middle" title={node.name}>
                            {node.name}
                          </div>
                        </div>
                        <div className="text-[10px] text-text-secondary pl-2 ml-auto flex items-center gap-1.5">
                          <span>{(node as Project).branch}</span>
                          <span>·</span>
                          <span className="tabular-nums">{(node as Project).daysRequired}d</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 relative h-12 flex items-center">
                      {/* Bar */}
                      <div
                        className="absolute h-7 rounded-md flex items-center overflow-hidden transition-all group-hover/bar:shadow-sm cursor-pointer"
                        style={{
                          left: bar.left,
                          width: bar.width,
                          background: `linear-gradient(135deg, ${bar.color.bg}, ${bar.color.bg}dd)`,
                          border: `1.5px solid ${bar.color.text}30`,
                        }}
                        onMouseEnter={(e) => handleBarHover(e, node as Project)}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {bar.width > 40 && (
                          <span
                            className="text-[10px] font-semibold truncate px-1.5 whitespace-nowrap"
                            style={{ color: bar.color.text }}
                          >
                            {node.name}
                          </span>
                        )}
                      </div>

                      {/* Dependency arrow */}
                      {dep && (() => {
                        const targetBar = getBarProps(dep.to);
                        if (!targetBar) return null;
                        const fromX = bar.left + bar.width;
                        const toX = targetBar.left;
                        if (toX <= fromX) return null;

                        return (
                          <svg
                            className="absolute top-0 left-0 pointer-events-none"
                            style={{ width: timelineWidth, height: 48 }}
                          >
                            <path
                              d={`M ${fromX} 24 C ${fromX + 20} 24, ${toX - 20} 24, ${toX} 24`}
                              fill="none"
                              stroke="#9F8FEF"
                              strokeWidth="1.5"
                              strokeDasharray="4 2"
                              opacity="0.6"
                            />
                            <polygon
                              points={`${toX - 5},20 ${toX},24 ${toX - 5},28`}
                              fill="#9F8FEF"
                              opacity="0.6"
                            />
                          </svg>
                        );
                      })()}

                      {/* Today line */}
                      {showTodayLine && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-400/40"
                          style={{ left: todayOffset * dayWidth }}
                        />
                      )}
                    </div>
                  </div>
                );
              };

              // Render traversal respecting node expansion
              const renderTree = (nodes: any[], level = 0): any[] => {
                const items: any[] = [];
                for (const n of nodes) {
                  items.push(renderNode(n, level));
                  const nodeState = state.projects.find(p => p.id === n.id);
                  const expanded = nodeState?.isExpanded ?? true;
                  if (n.children && n.children.length > 0 && expanded) {
                    items.push(...renderTree(n.children, level + 1));
                  }
                }
                return items;
              };

              return (
                <div key={person}>
                  {/* Person header row */}
                  <div
                    className="flex items-center border-b border-border bg-bg-secondary/40 cursor-pointer hover:bg-bg-secondary/70 transition-colors"
                    onClick={() => togglePerson(person)}
                  >
                    <div className="w-[200px] min-w-[200px] px-3 py-2 border-r border-border flex items-center gap-2 sticky left-0 z-10 bg-bg-secondary/40">
                      {isCollapsed ? <ChevronRight size={14} className="text-text-secondary" /> : <ChevronDown size={14} className="text-text-secondary" />}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: personColor }}
                      >
                        {person.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-text-primary">{person}</span>
                      <span className="text-[10px] text-text-secondary bg-white px-1.5 py-0.5 rounded-full ml-auto">
                        {personProjectList.length}
                      </span>
                    </div>

                    {/* Compact preview when collapsed */}
                    <div className="flex-1 relative h-8">
                      {isCollapsed && personProjectList.map((proj) => {
                        const bar = getBarProps(proj);
                        if (!bar) return null;
                        return (
                          <div
                            key={proj.id}
                            className="absolute top-1 h-6 rounded-md"
                            style={{
                              left: bar.left,
                              width: bar.width,
                              background: bar.color.bg,
                              border: `1px solid ${bar.color.text}30`,
                              opacity: 0.7,
                            }}
                          />
                        );
                      })}

                      {/* Today line */}
                      {showTodayLine && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-400/50"
                          style={{ left: todayOffset * dayWidth }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Expanded hierarchical rows */}
                  {!isCollapsed && renderTree(roots)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating tooltip */}
        {tooltip && (
          <GanttTooltip
            project={tooltip.project}
            x={tooltip.x}
            y={tooltip.y}
          />
        )}
      </div>
    </div>
  );
}

function GanttTooltip({ project, x, y }: { project: Project; x: number; y: number }) {
  const loadColor = getLoadColor(project.dailyLoad);
  const loadPct = Math.round(project.dailyLoad * 100);

  return (
    <div
      className="absolute z-50 bg-white border border-border rounded-lg shadow-xl p-3 min-w-[220px] pointer-events-none fade-in"
      style={{
        left: Math.min(x + 10, window.innerWidth - 260),
        top: y - 10,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="font-semibold text-sm text-text-primary mb-1">{project.name}</div>
      <div className="text-[11px] text-text-secondary mb-2">
        {project.branch} · {project.type}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <div className="text-text-secondary">Inicio</div>
        <div className="text-text-primary tabular-nums">
          {project.startDate ? format(project.startDate, 'dd/MM/yyyy') : '—'}
        </div>
        <div className="text-text-secondary">Fin</div>
        <div className="text-text-primary tabular-nums">
          {project.endDate ? format(project.endDate, 'dd/MM/yyyy') : '—'}
        </div>
        <div className="text-text-secondary">Días requeridos</div>
        <div className="text-text-primary font-medium">{project.daysRequired}</div>
        <div className="text-text-secondary">Días asignados</div>
        <div className="text-text-primary">{project.assignedDays}</div>
        <div className="text-text-secondary">Balance</div>
        <div className={project.balanceDays >= 0 ? 'text-[#2D6A2E] font-medium' : 'text-[#B71C1C] font-medium'}>
          {project.balanceDays > 0 ? '+' : ''}{project.balanceDays} días
        </div>
        <div className="text-text-secondary">Carga diaria</div>
        <div>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: loadColor.bg, color: loadColor.text }}
          >
            {loadPct}%
          </span>
        </div>
      </div>

      {project.blockedBy && (
        <div className="mt-2 pt-2 border-t border-border text-[11px]">
          <span className="text-text-secondary">Bloqueado por: </span>
          <span className="text-accent-purple font-medium">{project.blockedBy}</span>
        </div>
      )}
      {project.blocksTo && (
        <div className="text-[11px]">
          <span className="text-text-secondary">Bloquea a: </span>
          <span className="text-accent-purple font-medium">{project.blocksTo}</span>
        </div>
      )}
    </div>
  );
}
