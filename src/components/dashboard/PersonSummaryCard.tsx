import { useEffect, useMemo, useState, useRef } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { usePersonProfiles } from '@/context/PersonProfilesContext';
import { getPersonSummary, getPersonsWithCatalog, addPersonToCatalog } from '@/lib/workloadEngine';
import { buildHierarchy, isParent, aggregateFromChildren } from '@/lib/hierarchyEngine';
import { LoadBubble } from '@/components/shared/LoadBubble';
import { PERSON_COLORS, getLoadColor } from '@/lib/constants';
import { formatDateShort, format, isValidDateValue } from '@/lib/dateUtils';
import { Briefcase, TrendingUp, Zap, Calendar, Users, Pencil, Upload, Trash2, Plus } from 'lucide-react';
import { listBoardColumns, listTaskColumnValues } from '@/lib/dynamicColumnsRepository';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';

export function PersonSummaryCards() {
  const { state, filteredProjects, workloadData, activeBoardId } = useProject();
  const { user } = useAuth();
  const { getAvatarUrl, setAvatar, deleteProfile } = usePersonProfiles();
  const [progressByTaskId, setProgressByTaskId] = useState<Map<string, number>>(new Map());
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null);
  const [showPersonMenu, setShowPersonMenu] = useState<string | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const persons = useMemo(() => {
    const ps = getPersonsWithCatalog(filteredProjects, activeBoardId);
    return state.filters.persons.length > 0 ? ps.filter(p => state.filters.persons.includes(p)) : ps;
  }, [filteredProjects, state.filters.persons, activeBoardId]);

  const handleAddPerson = () => {
    const clean = newPersonName.trim();
    if (clean && activeBoardId) {
      addPersonToCatalog(clean, activeBoardId);
      setNewPersonName('');
      setShowAddPerson(false);
      // Force refresh by triggering a state update - we'll reload the page or use a context
      window.location.reload();
    }
  };

  const summaries = useMemo(() => {
    return persons.map((person) => {
      const wl = workloadData.get(person) || [];
      return getPersonSummary(person, filteredProjects, wl, state.config);
    });
  }, [persons, filteredProjects, workloadData, state.config]);

  useEffect(() => {
    if (!activeBoardId || !user) {
      setProgressByTaskId(new Map());
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const [columns, values] = await Promise.all([
          listBoardColumns(activeBoardId),
          listTaskColumnValues(activeBoardId),
        ]);
        if (cancelled) return;

        const progressColumnIds = new Set(
          columns
            .filter((c) => c.type === 'number' && c.config?.display === 'progress')
            .map((c) => c.id)
        );

        const next = new Map<string, number>();
        values.forEach((rowValues, taskId) => {
          const vals = Array.from(progressColumnIds)
            .map((colId) => rowValues[colId])
            .map((v) => (typeof v === 'number' ? v : Number(v)))
            .filter((v) => Number.isFinite(v))
            .map((v) => Math.max(0, Math.min(100, v)));
          if (vals.length === 0) return;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          next.set(taskId, Math.round(avg));
        });
        setProgressByTaskId(next);
      } catch {
        if (!cancelled) setProgressByTaskId(new Map());
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeBoardId, user]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPersonMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <Users size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay personas para mostrar</p>
        <p className="text-xs mt-1">Carga datos o ajusta los filtros.</p>
        {showAddPerson ? (
          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              placeholder="Nombre de persona"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddPerson(); if (e.key === 'Escape') setShowAddPerson(false); }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg w-48"
              autoFocus
            />
            <button
              onClick={handleAddPerson}
              disabled={!newPersonName.trim()}
              className="px-3 py-1.5 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
            >
              Agregar
            </button>
            <button
              onClick={() => { setShowAddPerson(false); setNewPersonName(''); }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-bg-secondary"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddPerson(true)}
            className="mt-4 px-4 py-2 text-sm bg-accent-blue text-white rounded-lg hover:bg-accent-blue/90 flex items-center gap-2"
          >
            <Plus size={16} />
            Agregar persona
          </button>
        )}
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
            date: isValidDateValue(w.date) ? format(w.date, 'dd/MM') : 'Fecha inválida',
          }));
          const color = PERSON_COLORS[idx % PERSON_COLORS.length];
          const initials = summary.person
            .split(' ')
            .map(w => w.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
          const avatarUrl = getAvatarUrl(summary.person);

          const avgLoadColor = getLoadColor(summary.avgLoad);
          const peakLoadColor = getLoadColor(summary.peakLoad);
          const personProgressValues = filteredProjects
            .filter((p) => p.assignees.includes(summary.person))
            .map((p) => progressByTaskId.get(p.id))
            .filter((v): v is number => typeof v === 'number');
          const avgProgress = personProgressValues.length > 0
            ? Math.round(personProgressValues.reduce((a, b) => a + b, 0) / personProgressValues.length)
            : null;

          // Person's projects with their load
          const personProjects = filteredProjects
            .filter(
              (p) =>
                p.assignees.includes(summary.person) &&
                isValidDateValue(p.startDate) &&
                isValidDateValue(p.endDate),
            )
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
                  className="relative group"
                  onMouseEnter={() => setHoveredPerson(summary.person)}
                  onMouseLeave={() => setHoveredPerson(null)}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={summary.person}
                      className="w-12 h-12 rounded-full object-cover border border-border shadow-sm flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </div>
                  )}
                  
                  {/* Hover pencil icon */}
                  {hoveredPerson === summary.person && (
                    <div 
                      className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full border border-border shadow-sm flex items-center justify-center cursor-pointer hover:bg-bg-secondary transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPersonMenu(showPersonMenu === summary.person ? null : summary.person);
                      }}
                    >
                      <Pencil size={10} className="text-text-secondary" />
                    </div>
                  )}
                  
                  {/* Context menu */}
                  {showPersonMenu === summary.person && (
                    <div 
                      ref={menuRef}
                      className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-50 min-w-[140px]"
                    >
                      <label className="flex items-center gap-2 px-3 py-2 text-xs text-text-primary hover:bg-bg-secondary cursor-pointer">
                        <Upload size={12} />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              await setAvatar(summary.person, file);
                              setShowPersonMenu(null);
                            }
                          }}
                        />
                        Subir foto
                      </label>
                      
                      {avatarUrl && (
                        <button
                          className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 w-full text-left"
                          onClick={async () => {
                            await deleteProfile(summary.person);
                            setShowPersonMenu(null);
                          }}
                        >
                          <Trash2 size={12} />
                          Eliminar foto
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-text-primary truncate">{summary.person}</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {summary.activeProjects} activo{summary.activeProjects !== 1 ? 's' : ''} de {summary.totalProjects} proyecto{summary.totalProjects !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Avance prom.: {avgProgress === null ? '—' : `${avgProgress}%`}
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
                  Pico máximo: {isValidDateValue(summary.peakDate) ? formatDateShort(summary.peakDate) : 'Fecha inválida'}
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
                              {isValidDateValue(p.startDate) ? formatDateShort(p.startDate) : 'Fecha inválida'}
                            </span>
                            <span className="text-[9px] text-text-secondary tabular-nums">
                              {isValidDateValue(p.endDate) ? formatDateShort(p.endDate) : 'Fecha inválida'}
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
