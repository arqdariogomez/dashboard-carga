import { useEffect, useMemo, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons } from '@/lib/workloadEngine';
import { PERSON_COLORS } from '@/lib/constants';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart as LineChartIcon, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { ZoomControls, type TimePreset } from '@/components/shared/ZoomControls';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Brush,
} from 'recharts';

export function WorkloadLineChart() {
  const { state, filteredProjects, workloadData, dateRange } = useProject();
  const [visibleRange, setVisibleRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [yMode, setYMode] = useState<'auto' | '200' | '300'>('auto');
  
  // Estado para zoom
  const [zoomScale, setZoomScale] = useState(1);
  const [activePreset, setActivePreset] = useState<TimePreset | null>('ALL');

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
  const canRenderAreas = persons.length <= 6 && visibleDays <= 120;
  const yDomain = yMode === 'auto' ? [0, 'auto'] as const : [0, Number(yMode)] as const;

  const todayLabel = useMemo(() => {
    const todayEntry = chartData.find((d) => 'isToday' in d && d.isToday);
    return todayEntry?.label || null;
  }, [chartData]);

  // Manejador de zoom con sistema de tickets
  const handleZoomChange = useCallback((newZoom: number, preset: TimePreset | null) => {
    // Crear ticket para aislar esta operación de zoom
    let syncManager = null;
    try {
      syncManager = (window as any).SyncManager?.getInstance();
    } catch (error) {
      console.warn('🎫 SyncManager no disponible, usando zoom sin ticket', error);
    }
    
    const ticket = syncManager 
      ? syncManager.createTicket('zoom', `Zoom cambiado a ${newZoom.toFixed(2)}x, preset: ${preset || 'custom'}`, 8000)
      : null;
    
    setZoomScale(newZoom);
    setActivePreset(preset);
    
    if (chartData.length === 0) return;
    
    // Calcular el rango visible basado en el zoom
    let visibleDays: number;
    if (preset === 'ALL') {
      visibleDays = chartData.length;
    } else if (preset) {
      const presetDays: Record<TimePreset, number> = {
        '2W': 14, '1M': 30, '3M': 90, '6M': 180, 'ALL': chartData.length,
      };
      visibleDays = Math.min(presetDays[preset], chartData.length);
    } else {
      // Calcular días basados en zoom (escala logarítmica invertida)
      const logMin = Math.log(0.3);
      const logMax = Math.log(3);
      const t = (Math.log(newZoom) - logMin) / (logMax - logMin);
      const minDays = 14;
      const maxDays = Math.min(365, chartData.length);
      const logRange = Math.log(maxDays) - Math.log(minDays);
      visibleDays = Math.round(Math.exp(Math.log(maxDays) - t * logRange));
    }
    
    const endIndex = chartData.length - 1;
    const startIndex = Math.max(0, endIndex - visibleDays + 1);
    setVisibleRange({ startIndex, endIndex });
    
    // Liberar el ticket después de un breve retraso para asegurar que la operación se complete
    if (ticket) {
      setTimeout(() => {
        try {
          syncManager?.releaseTicket(ticket.id);
        } catch (error) {
          console.warn('🎫 Error liberando ticket de zoom', error);
        }
      }, 100);
    }
  }, [chartData]);

  // Limpiar tickets al desmontar para evitar bloqueos persistentes
  useEffect(() => {
    return () => {
      const syncManager = SyncManager.getInstance();
      syncManager.forceReleaseAll();
    };
  }, []);

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
    <div className="p-3 flex-1 min-h-0 flex flex-col">
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
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <ZoomControls
              zoom={zoomScale}
              activePreset={activePreset}
              onZoomChange={handleZoomChange}
              variant="full"
              visibleRange={visibleRange ? {
                start: new Date(chartData[visibleRange.startIndex]?.date || ''),
                end: new Date(chartData[visibleRange.endIndex]?.date || '')
              } : null}
            />
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
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
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
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
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
            {canRenderAreas &&
              persons.map((person, i) => (
                <Area
                  key={`area-${person}`}
                  type="monotone"
                  dataKey={person}
                  fill={PERSON_COLORS[i % PERSON_COLORS.length]}
                  fillOpacity={0.07}
                  stroke="none"
                  isAnimationActive={false}
                />
              ))}
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
    </div>
  );
}
