import { Check, X } from 'lucide-react';

interface ProgressRatingProps {
  value: number;
  onChange: (value: number) => void;
}

export function ProgressRating({ value, onChange }: ProgressRatingProps) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((progress) => (
        <button
          key={progress}
          type="button"
          onClick={() => onChange(progress)}
          className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
            progress <= value
              ? progress === 4
                ? 'bg-green-500 text-white hover:bg-green-600'
                : progress === 0
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
          }`}
          title={`Progreso: ${progress * 25}%`}
        >
          {progress === 4 && <Check size={10} />}
          {progress === 0 && <X size={10} />}
          {progress === 1 && '25%'}
          {progress === 2 && '50%'}
          {progress === 3 && '75%'}
        </button>
      ))}
    </div>
  );
}
