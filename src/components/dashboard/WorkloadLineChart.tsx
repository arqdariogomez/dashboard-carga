import { useEffect, useMemo, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons } from '@/lib/workloadEngine';
import { PERSON_COLORS } from '@/lib/constants';
import { format, isToday, startOfDay, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart as LineChartIcon, X, ChevronLeft, ChevronRight, Users, Building, Tag, Clock, Calendar, Home, Target } from 'lucide-react';

// Helper function para encontrar el índice de fecha más cercana
function findClosestDateIndex(
  chartData: Array<{ date: string }>,
  target: Date
): number {
  const targetStr = format(target, 'yyyy-MM-dd');
  const exact = chartData.findIndex(d => d.date === targetStr);
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

export function WorkloadLineChart() {
  const { state, filteredProjects, workloadData, dateRange } = useProject();
  const [visibleRange, setVisibleRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [yMode, setYMode] = useState<'auto' | '200' | '300'>('auto');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByOption>('person');

  const persons = useMemo(() => {
    const ps = getPersons(filteredProjects);
    return state.filters.persons.length > 0 ? ps.filter((p) => state.filters.persons.includes(p)) : ps;
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

    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, dataByDate]) => ({
        date: key,
        label: format(new Date(key), 'dd MMM', { locale: es }),
        ...dataByDate,
      }));
    return data;
  }, [persons, workloadData, dateRange]);

  useEffect(() => {
    if (chartData.length === 0) {
      setVisibleRange(null);
      return;
    }
    setVisibleRange((prev) => {
      if (!prev) {
        const start = Math.max(0, chartData.length - Math.min(45, chartData.length));
        return { startIndex: start, endIndex: chartData.length - 1 };
      }
      const startIndex = Math.max(0, Math.min(prev.startIndex, chartData.length - 1));
      const endIndex = Math.max(startIndex, Math.min(prev.endIndex, chartData.length - 1));
      if (startIndex === prev.startIndex && endIndex === prev.endIndex) return prev;
      return { startIndex, endIndex };
    });
  }, [chartData.length]);

  const visibleDays = visibleRange ? visibleRange.endIndex - visibleRange.startIndex + 1 : chartData.length;
  const canRenderDots = visibleDays <= 70;
  const yDomain = yMode === 'auto' ? [0, 'auto'] as const : [0, Number(yMode)] as const;

  const todayLabel = useMemo(() => {
    const todayEntry = chartData.find((d) => (d as any).isToday === 1);
    return todayEntry?.label || null;
  }, [chartData]);

  // Navegación rápida a fechas predefinidas
  const navigateToDate = useCallback((targetDate: Date) => {
    const targetIndex = findClosestDateIndex(chartData, targetDate);
    
    if (targetIndex >= 0) {
      setSelectedDate(new Date(chartData[targetIndex].date));
      // Centrar el viewport alrededor de la fecha encontrada
      const halfWindow = 22;
      const startIndex = Math.max(0, targetIndex - halfWindow);
      const endIndex = Math.min(chartData.length - 1, targetIndex + halfWindow);
      setVisibleRange({ startIndex, endIndex });
    }
  }, [chartData]);

  // Calcular detalles del día seleccionado
  const dayDetails = useMemo((): DayDetails | null => {
    if (!selectedDate || !filteredProjects.length) return null;

    const sel = startOfDay(selectedDate).getTime();

    const projects = filteredProjects
      .filter(project => {
        if (!project.startDate || !project.endDate) return false;
        const start = startOfDay(new Date(project.startDate)).getTime();
        const end = startOfDay(new Date(project.endDate)).getTime();
        return sel >= start && sel <= end;
      })
      .map(project => ({
        id: project.id,
        name: project.name,
        assignee: Array.isArray(project.assignees) && project.assignees.length > 0 
          ? project.assignees[0] 
          : 'Sin asignar',
        branch: Array.isArray(project.branch) ? project.branch[0] : project.branch,
        type: project.type,
        priority: project.priority === 1 ? 'low' : project.priority === 2 ? 'medium' : 'high' as 'low' | 'medium' | 'high',
        startDate: new Date(project.startDate!),
        endDate: new Date(project.endDate!),
      }));

    return { date: selectedDate, projects };
  }, [selectedDate, filteredProjects]);

  // Manejador de clic en el gráfico
  const handleChartClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.date) {
      const dateStr = data.activePayload[0].payload.date;
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        setSelectedDate(date);
      }
    }
  }, []);

  // Navegación entre días
  const navigateDay = useCallback((direction: 'prev' | 'next') => {
    if (!selectedDate || !chartData.length) return;
    
    const currentIndex = chartData.findIndex(d => d.date === format(selectedDate, 'yyyy-MM-dd'));
    let newIndex = currentIndex;
    
    if (direction === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'next' && currentIndex < chartData.length - 1) {
      newIndex = currentIndex + 1;
    }
    
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < chartData.length) {
      setSelectedDate(new Date(chartData[newIndex].date));
    }
  }, [selectedDate, chartData]);

  // Calcular índice de fecha seleccionada una vez
  const selectedDateIndex = useMemo(() => {
    if (!selectedDate) return -1;
    return chartData.findIndex(d => d.date === format(selectedDate, 'yyyy-MM-dd'));
  }, [selectedDate, chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <LineChartIcon size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay datos para el grafico</p>
        <p className="text-xs mt-1">Verifica los filtros activos o carga un archivo.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-row">
      <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-6 flex-1 min-h-0 flex flex-col min-w-0">
        {/* Barra de herramientas moderna */}
        <div className="mb-6 flex items-center justify-between gap-4 flex-shrink-0">
          {/* Controles de escala */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-gray-50 rounded-lg border border-gray-200/60">
              <button
                type="button"
                onClick={() => setYMode('auto')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  yMode === 'auto' 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Auto
              </button>
              <button
                type="button"
                onClick={() => setYMode('200')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  yMode === '200' 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                200%
              </button>
              <button
                type="button"
                onClick={() => setYMode('300')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                  yMode === '300' 
                    ? 'bg-blue-500 text-white shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                300%
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <button
                type="button"
                onClick={() => {
                  if (chartData.length === 0) return;
                  setVisibleRange({ startIndex: 0, endIndex: chartData.length - 1 });
                }}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all duration-200 flex items-center gap-1.5"
              >
                <Target size={14} />
                Ajustar
              </button>
            </div>
          </div>
          
          {/* Botones de navegación rápida */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-gray-50 rounded-lg border border-gray-200/60">
              <button
                onClick={() => navigateToDate(new Date())}
                className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-all duration-200 shadow-sm flex items-center gap-1.5"
              >
                <Home size={14} />
                Hoy
              </button>
              <button
                onClick={() => navigateToDate(subDays(new Date(), 14))}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 flex items-center gap-1.5"
              >
                <Calendar size={14} />
                2S
              </button>
              <button
                onClick={() => navigateToDate(subMonths(new Date(), 1))}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 flex items-center gap-1.5"
              >
                1M
              </button>
              <button
                onClick={() => navigateToDate(subMonths(new Date(), 3))}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 flex items-center gap-1.5"
              >
                3M
              </button>
              <button
                onClick={() => navigateToDate(chartData.length > 0 ? new Date(chartData[0].date) : new Date())}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 flex items-center gap-1.5"
              >
                Todo
              </button>
            </div>
          </div>
          
          {/* Leyenda de personas */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {persons.map((person, i) => (
              <div key={person} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200/60">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: PERSON_COLORS[i % PERSON_COLORS.length] }} />
                <span className="text-sm font-medium text-gray-700">{person}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Contenedor del gráfico */}
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200/60 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={chartData} 
            margin={{ top: 16, right: 20, left: 8, bottom: 16 }}
            onClick={handleChartClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.5} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6B7280', fontFamily: 'Inter, system-ui, sans-serif' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB', strokeWidth: 1 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6B7280', fontFamily: 'Inter, system-ui, sans-serif' }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB', strokeWidth: 1 }}
              tickFormatter={(v) => `${v}%`}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid rgba(229, 231, 235, 0.8)',
                borderRadius: '12px',
                fontSize: '12px',
                fontFamily: 'Inter, system-ui, sans-serif',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
                padding: '12px 16px',
                backdropFilter: 'blur(8px)',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${value}%`, name]}
              labelFormatter={(label) => label}
            />
            <ReferenceLine
              y={100}
              stroke="#F59E0B"
              strokeDasharray="8 4"
              strokeWidth={2}
              label={{ value: '100% capacidad', position: 'insideTopRight', fontSize: 11, fill: '#F59E0B', fontFamily: 'Inter, system-ui, sans-serif' }}
            />
            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#EF4444"
                strokeDasharray="6 3"
                strokeWidth={2}
                label={{ value: 'HOY', position: 'top', fontSize: 10, fill: '#EF4444', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600 }}
              />
            )}
            {selectedDate && (
              <ReferenceLine
                x={format(selectedDate, 'dd MMM', { locale: es })}
                stroke="#3B82F6"
                strokeWidth={2.5}
                strokeDasharray="8 4"
                label={{ 
                  value: 'Seleccionado', 
                  position: 'top', 
                  fontSize: 10, 
                  fill: '#3B82F6', 
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 600
                }}
              />
            )}
            {persons.map((person, i) => (
              <Line
                key={person}
                type="monotone"
                dataKey={person}
                stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                strokeWidth={2.5}
                dot={canRenderDots ? { r: 3, fill: PERSON_COLORS[i % PERSON_COLORS.length], strokeWidth: 2, stroke: '#fff' } : false}
                activeDot={{ r: 6, strokeWidth: 2.5, stroke: '#fff' }}
                isAnimationActive={false}
              />
            ))}
            {visibleRange && (
              <Brush
                dataKey="label"
                height={32}
                startIndex={visibleRange.startIndex}
                endIndex={visibleRange.endIndex}
                onChange={(next) => {
                  if (typeof next?.startIndex === 'number' && typeof next?.endIndex === 'number') {
                    setVisibleRange({ startIndex: next.startIndex, endIndex: next.endIndex });
                  }
                }}
                travellerWidth={16}
                stroke="#CBD5E1"
                fill="#F8FAFC"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>
      
      {/* Sidebar de detalles del día */}
      {selectedDate && dayDetails && (
        <div className="w-96 bg-white border-l border-gray-200/60 shadow-lg flex flex-col">
          {/* Header del sidebar */}
          <div className="p-6 border-b border-gray-200/60 bg-gray-50/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 group"
              >
                <X size={18} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            </div>
            
            {/* Navegación entre días */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <button
                onClick={() => navigateDay('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={selectedDateIndex <= 0}
              >
                <ChevronLeft size={18} className="text-gray-400" />
              </button>
              <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-semibold text-blue-700">
                  {dayDetails.projects.length} proyecto{dayDetails.projects.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => navigateDay('next')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={selectedDateIndex < 0 || selectedDateIndex >= chartData.length - 1}
              >
                <ChevronRight size={18} className="text-gray-400" />
              </button>
            </div>
            
            {/* Toggle de agrupación */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Agrupar por:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
                className="text-sm px-4 py-2 bg-white border border-gray-200 rounded-lg font-medium text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              >
                <option value="person">Persona</option>
                <option value="branch">Sucursal</option>
                <option value="type">Tipo</option>
              </select>
            </div>
          </div>
          
          {/* Lista de proyectos */}
          <div className="flex-1 overflow-y-auto p-6">
            {dayDetails.projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Calendar size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No hay proyectos para este día</p>
                <p className="text-gray-400 text-sm mt-1">Selecciona otra fecha para ver detalles</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dayDetails.projects.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 bg-gray-50 rounded-xl border border-gray-200/60 hover:shadow-md transition-all duration-200 hover:border-gray-300/80"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 text-base leading-tight flex-1 pr-3">
                        {project.name}
                      </h4>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full transition-all duration-200 ${
                        project.priority === 'high' 
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : project.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-green-100 text-green-700 border border-green-200'
                      }`}>
                        {project.priority === 'high' ? 'Alta' : project.priority === 'medium' ? 'Media' : 'Baja'}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                          <Users size={16} className="text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{project.assignee}</div>
                          <div className="text-xs text-gray-500">Asignado a</div>
                        </div>
                      </div>
                      
                      {project.branch && (
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                            <Building size={16} className="text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{project.branch}</div>
                            <div className="text-xs text-gray-500">Sucursal</div>
                          </div>
                        </div>
                      )}
                      
                      {project.type && (
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <Tag size={16} className="text-emerald-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{project.type}</div>
                            <div className="text-xs text-gray-500">Tipo</div>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
                          <Clock size={16} className="text-orange-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {format(project.startDate, 'd MMM', { locale: es })} - {format(project.endDate, 'd MMM', { locale: es })}
                          </div>
                          <div className="text-xs text-gray-500">Duración</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
