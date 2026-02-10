import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from 'lucide-react';

interface DateRangeSliderProps {
  min: Date;
  max: Date;
  value: { start: Date; end: Date } | null;
  onChange: (range: { start: Date; end: Date }) => void;
  label?: string;
  className?: string;
}

/**
 * Interactive date range slider for selecting custom date ranges
 * Supports dragging, clicking, and keyboard navigation
 */
export function DateRangeSlider({
  min,
  max,
  value,
  onChange,
  label = 'Rango de fechas',
  className = '',
}: DateRangeSliderProps) {
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

  // Calculate positions as percentages
  const totalMs = max.getTime() - min.getTime();
  const startPos = value
    ? ((value.start.getTime() - min.getTime()) / totalMs) * 100
    : 0;
  const endPos = value
    ? ((value.end.getTime() - min.getTime()) / totalMs) * 100
    : 100;

  const handleMouseDown = (thumb: 'start' | 'end') => {
    setIsDragging(thumb);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !value) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const newTime = min.getTime() + (percent / 100) * totalMs;
    const newDate = new Date(newTime);

    if (isDragging === 'start') {
      const maxAllowed = new Date(value.end.getTime() - 24 * 60 * 60 * 1000); // At least 1 day difference
      const constrainedDate = newDate < maxAllowed ? newDate : maxAllowed;
      onChange({ ...value, start: constrainedDate });
    } else {
      const minAllowed = new Date(value.start.getTime() + 24 * 60 * 60 * 1000);
      const constrainedDate = newDate > minAllowed ? newDate : minAllowed;
      onChange({ ...value, end: constrainedDate });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  const handleQuickRange = (days: number) => {
    if (!value) return;
    const start = value.end;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const constrainedEnd = end > max ? max : end;
    onChange({ start, end: constrainedEnd });
  };

  const handleReset = () => {
    onChange({ start: min, end: max });
  };

  const durationDays = Math.ceil(
    (value ? value.end.getTime() - value.start.getTime() : max.getTime() - min.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  if (!value) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-3 p-4 bg-white rounded-lg border border-border ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Calendar size={16} />
          {label}
        </label>
        <button
          onClick={handleReset}
          className="text-xs px-2 py-1 rounded bg-bg-secondary hover:bg-bg-secondary/80 text-text-secondary transition-colors"
        >
          Reiniciar
        </button>
      </div>

      {/* Slider */}
      <div
        className="relative h-8 rounded-full bg-bg-secondary cursor-pointer select-none"
        onMouseMove={isDragging ? handleMouseMove : undefined}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Track */}
        <div
          className="absolute top-1/2 h-2 bg-accent-blue/30 rounded-full -translate-y-1/2"
          style={{
            left: `${startPos}%`,
            right: `${100 - endPos}%`,
          }}
        />

        {/* Start thumb */}
        <button
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-accent-blue rounded-full shadow-md hover:w-6 hover:h-6 transition-all cursor-grab active:cursor-grabbing border-2 border-white"
          style={{ left: `${startPos}%` }}
          onMouseDown={() => handleMouseDown('start')}
          title={`Inicio: ${format(value.start, 'dd MMM yyyy', { locale: es })}`}
        />

        {/* End thumb */}
        <button
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-accent-blue rounded-full shadow-md hover:w-6 hover:h-6 transition-all cursor-grab active:cursor-grabbing border-2 border-white"
          style={{ left: `${endPos}%` }}
          onMouseDown={() => handleMouseDown('end')}
          title={`Fin: ${format(value.end, 'dd MMM yyyy', { locale: es })}`}
        />
      </div>

      {/* Date labels */}
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{format(value.start, 'dd MMM', { locale: es })}</span>
        <span className="font-medium">{durationDays} días</span>
        <span>{format(value.end, 'dd MMM yyyy', { locale: es })}</span>
      </div>

      {/* Quick adjust buttons */}
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => handleQuickRange(7)}
          className="flex-1 px-2 py-1.5 rounded border border-border hover:bg-bg-secondary transition-colors text-text-secondary hover:text-text-primary"
          title="Extender 7 días hacia el futuro"
        >
          +1 semana
        </button>
        <button
          onClick={() => handleQuickRange(30)}
          className="flex-1 px-2 py-1.5 rounded border border-border hover:bg-bg-secondary transition-colors text-text-secondary hover:text-text-primary"
          title="Extender 30 días hacia el futuro"
        >
          +1 mes
        </button>
        <button
          onClick={() => {
            if (!value) return;
            const start = new Date(value.start);
            start.setDate(start.getDate() - 7);
            const constrainedStart = start < min ? min : start;
            onChange({ start: constrainedStart, end: value.end });
          }}
          className="flex-1 px-2 py-1.5 rounded border border-border hover:bg-bg-secondary transition-colors text-text-secondary hover:text-text-primary"
          title="Retroceder 7 días"
        >
          -1 semana
        </button>
      </div>
    </div>
  );
}
