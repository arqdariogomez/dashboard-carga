import { useEffect, useMemo, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons } from '@/lib/workloadEngine';
import { PERSON_COLORS } from '@/lib/constants';
import { format, isToday, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart as LineChartIcon, X, ChevronLeft, ChevronRight, Users, Building, Tag, Clock } from 'lucide-react';
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
    const todayEntry = chartData.find((d) => 'isToday' in d && d.isToday);
    return todayEntry?.label || null;
  }, [chartData]);

  // Calcular detalles del día seleccionado
  const dayDetails = useMemo((): DayDetails | null => {
    if (!selectedDate || !filteredProjects.length) return null;

    console.log('🔍 Debug - Fecha seleccionada:', selectedDate);
    console.log('🔍 Debug - Proyectos filtrados:', filteredProjects.length);

    const projects = filteredProjects
      .filter(project => {
        if (!project.startDate || !project.endDate) {
          console.log('⚠️ Proyecto sin fechas:', project.name);
          return false;
        }
        
        const projectStart = new Date(project.startDate);
        const projectEnd = new Date(project.endDate);
        
        // Normalizar fechas para comparación (ignorar hora)
        const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        const projectStartOnly = new Date(projectStart.getFullYear(), projectStart.getMonth(), projectStart.getDate());
        const projectEndOnly = new Date(projectEnd.getFullYear(), projectEnd.getMonth(), projectEnd.getDate());
        
        const isActive = isWithinInterval(selectedDateOnly, { start: projectStartOnly, end: projectEndOnly });
        
        if (isActive) {
          console.log('✅ Proyecto activo:', project.name, 'Fechas:', projectStartOnly, 'a', projectEndOnly);
        }
        
        return isActive;
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

    console.log('🔍 Debug - Proyectos encontrados para el día:', projects.length);

    return { date: selectedDate, projects };
  }, [selectedDate, filteredProjects]);

  // Manejador de clic en el gráfico
  const handleChartClick = useCallback((data: any) => {
    if (data && data.activeLabel) {
      const dateStr = data.activeLabel;
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
    <div className="p-3 flex-1 min-h-0 flex">
      <div className="bg-white rounded-xl border border-border p-3 flex-1 min-h-0 flex flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYMode('auto')}
              className={`px-2 py-1 text-[11px] rounded-md border ${yMode === 'auto' ? 'bg-text-primary text-white border-text-primary' : 'bg-white text-text-secondary border-border hover:bg-bg-secondary'}`}
            >
              Escala auto
            </button>
            <button
              type="button"
              onClick={() => setYMode('200')}
              className={`px-2 py-1 text-[11px] rounded-md border ${yMode === '200' ? 'bg-text-primary text-white border-text-primary' : 'bg-white text-text-secondary border-border hover:bg-bg-secondary'}`}
            >
              Tope 200%
            </button>
            <button
              type="button"
              onClick={() => setYMode('300')}
              className={`px-2 py-1 text-[11px] rounded-md border ${yMode === '300' ? 'bg-text-primary text-white border-text-primary' : 'bg-white text-text-secondary border-border hover:bg-bg-secondary'}`}
            >
              Tope 300%
            </button>
            <button
              type="button"
              onClick={() => {
                if (chartData.length === 0) return;
                setVisibleRange({ startIndex: 0, endIndex: chartData.length - 1 });
              }}
              className="px-2 py-1 text-[11px] rounded-md border border-border bg-white text-text-secondary hover:bg-bg-secondary"
            >
              Ajustar rango
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {persons.map((person, i) => (
              <span key={person} className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PERSON_COLORS[i % PERSON_COLORS.length] }} />
                {person}
              </span>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={chartData} 
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            onClick={handleChartClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E9E9E7" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#787774' }}
              tickLine={false}
              axisLine={{ stroke: '#E9E9E7' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#787774' }}
              tickLine={false}
              axisLine={{ stroke: '#E9E9E7' }}
              tickFormatter={(v) => `${v}%`}
              domain={yDomain}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #E9E9E7',
                borderRadius: '8px',
                fontSize: '11px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                padding: '10px 14px',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${value}%`, name]}
              labelFormatter={(label) => label}
            />
            <ReferenceLine
              y={100}
              stroke="#E2945E"
              strokeDasharray="5 5"
              label={{ value: '100% capacidad', position: 'insideTopRight', fontSize: 10, fill: '#E2945E' }}
            />
            {todayLabel && (
              <ReferenceLine
                x={todayLabel}
                stroke="#F87171"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: 'HOY', position: 'top', fontSize: 9, fill: '#F87171', fontWeight: 'bold' }}
              />
            )}
            {selectedDate && (
              <ReferenceLine
                x={format(selectedDate, 'dd MMM', { locale: es })}
                stroke="#3B82F6"
                strokeWidth={2}
                strokeDasharray="6 3"
                label={{ 
                  value: 'Seleccionado', 
                  position: 'top', 
                  fontSize: 9, 
                  fill: '#3B82F6', 
                  fontWeight: 'bold' 
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
                dot={canRenderDots ? { r: 2, fill: PERSON_COLORS[i % PERSON_COLORS.length] } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                isAnimationActive={false}
              />
            ))}
            {visibleRange && (
              <Brush
                dataKey="label"
                height={24}
                startIndex={visibleRange.startIndex}
                endIndex={visibleRange.endIndex}
                onChange={(next) => {
                  if (typeof next?.startIndex === 'number' && typeof next?.endIndex === 'number') {
                    setVisibleRange({ startIndex: next.startIndex, endIndex: next.endIndex });
                  }
                }}
                travellerWidth={14}
                stroke="#9CA3AF"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>
      
      {/* Sidebar de detalles del día */}
      {selectedDate && dayDetails && (
        <div className="w-80 bg-white border-l border-border flex flex-col">
          {/* Header del sidebar */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary">
                {format(selectedDate, 'd [de] MMMM [de] yyyy', { locale: es })}
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1 hover:bg-bg-secondary rounded-md transition-colors"
              >
                <X size={16} className="text-text-secondary" />
              </button>
            </div>
            
            {/* Navegación entre días */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <button
                onClick={() => navigateDay('prev')}
                className="p-1 hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50"
                disabled={!chartData.find(d => d.date === format(selectedDate, 'yyyy-MM-dd')) || chartData.findIndex(d => d.date === format(selectedDate, 'yyyy-MM-dd')) === 0}
              >
                <ChevronLeft size={16} className="text-text-secondary" />
              </button>
              <span className="text-xs text-text-secondary">
                {dayDetails.projects.length} proyecto{dayDetails.projects.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => navigateDay('next')}
                className="p-1 hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50"
                disabled={!chartData.find(d => d.date === format(selectedDate, 'yyyy-MM-dd')) || chartData.findIndex(d => d.date === format(selectedDate, 'yyyy-MM-dd')) === chartData.length - 1}
              >
                <ChevronRight size={16} className="text-text-secondary" />
              </button>
            </div>
            
            {/* Toggle de agrupación */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">Agrupar por:</span>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
                className="text-xs px-2 py-1 border border-border rounded-md bg-white text-text-primary"
              >
                <option value="person">Persona</option>
                <option value="branch">Sucursal</option>
                <option value="type">Tipo</option>
              </select>
            </div>
          </div>
          
          {/* Lista de proyectos */}
          <div className="flex-1 overflow-y-auto p-4">
            {dayDetails.projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-text-secondary">No hay proyectos para este día</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dayDetails.projects.map((project) => (
                  <div
                    key={project.id}
                    className="p-3 bg-bg-secondary rounded-lg border border-border"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-text-primary text-sm leading-tight">
                        {project.name}
                      </h4>
                      <span className={`px-2 py-1 text-[10px] rounded-full ${
                        project.priority === 'high' 
                          ? 'bg-red-100 text-red-700'
                          : project.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {project.priority === 'high' ? 'Alta' : project.priority === 'medium' ? 'Media' : 'Baja'}
                      </span>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Users size={12} />
                        <span>{project.assignee}</span>
                      </div>
                      
                      {project.branch && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <Building size={12} />
                          <span>{project.branch}</span>
                        </div>
                      )}
                      
                      {project.type && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <Tag size={12} />
                          <span>{project.type}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Clock size={12} />
                        <span>
                          {format(project.startDate, 'd MMM', { locale: es })} - {format(project.endDate, 'd MMM', { locale: es })}
                        </span>
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
