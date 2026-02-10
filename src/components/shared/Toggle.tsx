import { cn } from '@/utils/cn';

interface ToggleProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}

export function Toggle({ options, value, onChange, size = 'md' }: ToggleProps) {
  return (
    <div className="inline-flex bg-bg-secondary rounded-md border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded transition-all duration-200 font-medium',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            value === opt.value
              ? 'bg-white text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
