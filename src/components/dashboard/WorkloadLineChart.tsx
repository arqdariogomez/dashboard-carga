import { useMemo, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { getPersons } from '@/lib/workloadEngine';
import { PERSON_COLORS } from '@/lib/constants';
import { format, isToday, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart as LineChartIcon, ZoomIn, ZoomOut } from 'lucide-react';
import { DateRangeSlider } from '@/components/shared/DateRangeSlider';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';

export function WorkloadLineChart() {
  const { state, filteredProjects, workloadData, dateRange } = useProject();
  const [showDateSlider, setShowDateSlider] = useState(false);
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | null>(null);

  const persons = useMemo(() => {
    const ps = getPersons(filteredProjects);
    return state.filters.persons.length > 0 ? ps.filter(p => state.filters.persons.includes(p)) : ps;
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

    let data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        date: key,
        label: format(new Date(key), 'dd MMM', { locale: es }),
        ...data,
      }));

    // Filter by custom range if set
    if (customRange) {
      const startStr = format(customRange.start, 'yyyy-MM-dd');
      const endStr = format(customRange.end, 'yyyy-MM-dd');
      data = data.filter(d => d.date >= startStr && d.date <= endStr);
    }

    return data;
  }, [persons, workloadData, dateRange, customRange]);

  // Find today's label for reference line
  const todayLabel = useMemo(() => {
    const todayEntry = chartData.find(d => 'isToday' in d && d.isToday);
    return todayEntry?.label || null;
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="w-16 h-16 rounded-2xl bg-bg-secondary flex items-center justify-center mb-3">
          <LineChartIcon size={28} className="text-text-secondary/50" />
        </div>
        <p className="text-sm font-medium">No hay datos para el gráfico</p>
        <p className="text-xs mt-1">Verifica los filtros activos o carga un archivo.</p>
      </div>
    );
  }

  return (
    <div className="p-4 flex-1 flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-border px-4 py-2">
        <label className="text-xs font-medium text-text-secondary">Herramientas de visualización</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!customRange || !dateRange) return;
              const newStart = addDays(customRange.start, -7);
              const newEnd = addDays(customRange.end, 7);
              setCustomRange({
                start: newStart < dateRange.start ? dateRange.start : newStart,
                end: newEnd > dateRange.end ? dateRange.end : newEnd,
              });
            }}
            className="p-1.5 rounded hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={() => {
              if (!customRange) return;
              const days = Math.ceil((customRange.end.getTime() - customRange.start.getTime()) / (1000 * 60 * 60 * 24));
              if (days <= 7) return; // No zoom in más de lo mínimo
              const reduction = Math.ceil(days / 4);
              setCustomRange({
                start: addDays(customRange.start, reduction),
                end: addDays(customRange.end, -reduction),
              });
            }}
            className="p-1.5 rounded hover:bg-bg-secondary text-text-secondary hover:text-text-primary transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => setShowDateSlider(!showDateSlider)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              showDateSlider
                ? 'bg-accent-blue text-white'
                : 'hover:bg-bg-secondary text-text-secondary hover:text-text-primary'
            }`}
          >
            📅 Rango
          </button>
        </div>
      </div>

      {/* Date range slider */}
      {showDateSlider && dateRange && (
        <DateRangeSlider
          min={dateRange.start}
          max={dateRange.end}
          value={customRange || dateRange}
          onChange={setCustomRange}
          label="Rango del gráfico"
        />
      )}

      {/* Chart */}
      <div className="bg-white rounded-xl border border-border p-5 h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
              domain={[0, 'auto']}
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
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
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
            {persons.map((person, i) => (
              <Area
                key={`area-${person}`}
                type="monotone"
                dataKey={person}
                fill={PERSON_COLORS[i % PERSON_COLORS.length]}
                fillOpacity={0.08}
                stroke="none"
              />
            ))}
            {persons.map((person, i) => (
              <Line
                key={person}
                type="monotone"
                dataKey={person}
                stroke={PERSON_COLORS[i % PERSON_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 2, fill: PERSON_COLORS[i % PERSON_COLORS.length] }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
