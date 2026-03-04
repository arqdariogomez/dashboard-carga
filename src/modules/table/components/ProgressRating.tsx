interface ProgressRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function ProgressRating({ value, onChange }: ProgressRatingProps) {
  const safe = typeof value === 'number' ? Math.max(0, Math.min(100, Math.round(value / 10) * 10)) : null;
  const current = safe ?? 0;

  return (
    <div className="w-[96px] mx-auto">
      <button
        type="button"
        className="w-full text-center text-[11px] tabular-nums text-text-secondary hover:text-text-primary"
        onClick={() => onChange(safe === null ? 0 : null)}
        title={safe === null ? 'Marcar 0%' : 'Limpiar avance'}
      >
        {safe === null ? '--' : `${safe}%`}
      </button>
      <div className="mt-1 flex items-end justify-center gap-[2px]">
        {Array.from({ length: 10 }, (_, i) => {
          const step = (i + 1) * 10;
          const active = step <= current;
          return (
            <button
              key={step}
              type="button"
              onClick={() => onChange(step)}
              className={`w-[8px] rounded-sm transition-colors ${active ? 'bg-emerald-500' : 'bg-slate-200 hover:bg-slate-300'}`}
              style={{ height: `${6 + i}px` }}
              aria-label={`Avance ${step}%`}
              title={`${step}%`}
            />
          );
        })}
      </div>
    </div>
  );
}
