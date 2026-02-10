import { useMemo } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons, getPersonSummary } from '@/lib/workloadEngine';
import { buildHierarchy, isParent, aggregateFromChildren } from '@/lib/hierarchyEngine';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { PERSON_COLORS, getLoadColor } from '@/lib/constants';
import { formatDateShort, format } from '@/lib/dateUtils';
import { Briefcase, TrendingUp, Zap, Calendar, Users } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';

export function PersonSummaryCards() {
  const { state, filteredProjects, workloadData } = useProject();

  const persons = useMemo(() => {
    const ps = getPersons(filteredProjects);
    return state.filters.persons.length > 0 ? ps.filter(p => state.filters.persons.includes(p)) : ps;
  }, [filteredProjects, state.filters.persons]);

  const summaries = useMemo(() => {
    return persons.map((person) => {
      const wl = workloadData.get(person) || [];
      return getPersonSummary(person, filteredProjects, wl, state.config);
    });
  }, [persons, filteredProjects, workloadData, state.config]);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <Users size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay personas para mostrar</p>
        <p className="text-xs mt-1">Carga datos o ajusta los filtros.</p>
      </div>
    );
  }

  return (
    <div className="p-4 flex-1 overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaries.map((summary, idx) => {
          const wl = workloadData.get(summary.person) || [];
          const sparkData = wl.slice(0, 60).map((w) => ({
            load: Math.round(w.totalLoad * 100),
            date: format(w.date, 'dd/MM'),
          }));
          const color = PERSON_COLORS[idx % PERSON_COLORS.length];
          const initials = summary.person
            .split(' ')
            .map(w => w.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');

          const avgLoadColor = getLoadColor(summary.avgLoad);
          const peakLoadColor = getLoadColor(summary.peakLoad);

          // Person's projects with their load
          const personProjects = filteredProjects
            .filter(p => p.assignees.includes(summary.person) && p.startDate && p.endDate)
            .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()));

          // Build hierarchical roots and flatten respecting `isExpanded` state
          const roots = buildHierarchy(personProjects);
          const flattened: any[] = [];
          const traverse = (node: any, level = 0) => {
            // If node is a parent in the currently visible set, aggregate visible children
            let merged = node as any;
            if (isParent(node.id, personProjects)) {
              const aggregated = aggregateFromChildren(node.id, personProjects, state.config);
              merged = { ...node, ...aggregated };
            }
            flattened.push({ node: merged, level });
            const nodeState = state.projects.find(p => p.id === node.id);
            const expanded = nodeState?.isExpanded ?? true;
            if (node.children && node.children.length > 0 && expanded) {
              node.children.forEach((c: any) => traverse(c, level + 1));
            }
          };
          roots.forEach(r => traverse(r, 0));

          return (
            <div
              key={summary.person}
              className="bg-white rounded-xl border border-border hover:shadow-md transition-all duration-200 overflow-hidden"
            >
              {/* Header with avatar */}
              <div className="px-5 pt-5 pb-3 flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-text-primary truncate">{summary.person}</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {summary.activeProjects} activo{summary.activeProjects !== 1 ? 's' : ''} de {summary.totalProjects} proyecto{summary.totalProjects !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Stats 2x2 grid */}
              <div className="grid grid-cols-2 gap-px bg-border mx-5 rounded-lg overflow-hidden mb-4">
                {/* Active projects */}
                <div className="bg-white p-3 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[10px] text-text-secondary mb-1">
                    <Briefcase size={10} />
                    <span>Proyectos</span>
                  </div>
                  <span className="text-lg font-bold text-text-primary tabular-nums">
                    {summary.activeProjects}
                  </span>
                </div>

                {/* Current load */}
                <div className="bg-white p-3 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[10px] text-text-secondary mb-1">
                    <Zap size={10} />
                    <span>Hoy</span>
                  </div>
                  <LoadBubble load={summary.currentLoad} size="sm" />
                </div>

                {/* Average */}
                <div className="bg-white p-3 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[10px] text-text-secondary mb-1">
                    <TrendingUp size={10} />
                    <span>Promedio</span>
                  </div>
                  <span
                    className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: avgLoadColor.bg, color: avgLoadColor.text }}
                  >
                    {Math.round(summary.avgLoad * 100)}%
                  </span>
                </div>

                {/* Peak */}
                <div className="bg-white p-3 flex flex-col items-center">
                  <div className="flex items-center gap-1 text-[10px] text-text-secondary mb-1">
                    <Calendar size={10} />
                    <span>Pico</span>
                  </div>
                  <span
                    className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: peakLoadColor.bg, color: peakLoadColor.text }}
                  >
                    {Math.round(summary.peakLoad * 100)}%
                  </span>
                </div>
              </div>

              {summary.peakDate && (
                <div className="mx-5 mb-3 text-[11px] text-text-secondary flex items-center gap-1 bg-bg-secondary px-2.5 py-1.5 rounded-md">
                  <Calendar size={11} />
                  Pico máximo: {formatDateShort(summary.peakDate)}
                </div>
              )}

              {/* Sparkline — 60 days */}
              {sparkData.length > 0 && (
                <div className="mx-5 mb-3">
                  <div className="text-[10px] font-semibold text-text-secondary mb-1 uppercase tracking-wider">
                    Carga próximos {sparkData.length} días
                  </div>
                  <div className="h-16 bg-bg-secondary/50 rounded-lg overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`sparkGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <ReferenceLine y={100} stroke="#E2945E" strokeDasharray="3 3" strokeWidth={1} />
                        <Area
                          type="monotone"
                          dataKey="load"
                          stroke={color}
                          fill={`url(#sparkGrad-${idx})`}
                          strokeWidth={1.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Project list with progress bars */}
              {personProjects.length > 0 && (
                <div className="px-5 pb-4">
                  <div className="text-[10px] font-semibold text-text-secondary mb-2 uppercase tracking-wider">
                    Proyectos asignados
                  </div>
                  <div className="space-y-2">
                    {flattened.slice(0, 5).map(({ node, level }, i) => {
                      const p = node as any;
                      const loadColor = getLoadColor(p.dailyLoad || 0);
                      const now = new Date();
                      let progress = 0;
                      if (p.startDate && p.endDate) {
                        const total = p.endDate.getTime() - p.startDate.getTime();
                        const elapsed = now.getTime() - p.startDate.getTime();
                        progress = Math.max(0, Math.min(100, (elapsed / total) * 100));
                      }

                      return (
                        <div key={p.id || `flat-${i}`} className="group/proj">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs text-text-primary truncate flex-1 font-medium" style={{ paddingLeft: level * 10 }}>{p.name}</span>
                            <span
                              className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: loadColor.bg, color: loadColor.text }}
                            >
                              {Math.round((p.dailyLoad || 0) * 100)}%
                            </span>
                          </div>

                          {/* Temporal progress bar */}
                          <div className="relative w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 left-0 h-full rounded-full transition-all"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: color,
                                opacity: 0.5,
                              }}
                            />
                          </div>

                          <div className="flex justify-between mt-0.5">
                            <span className="text-[9px] text-text-secondary tabular-nums">
                              {p.startDate ? formatDateShort(p.startDate) : ''}
                            </span>
                            <span className="text-[9px] text-text-secondary tabular-nums">
                              {p.endDate ? formatDateShort(p.endDate) : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {personProjects.length > 5 && (
                      <div className="text-[11px] text-text-secondary text-center pt-1">
                        +{personProjects.length - 5} más
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
