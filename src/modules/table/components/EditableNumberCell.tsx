import { useState, useRef, useEffect } from 'react';

interface EditableNumberCellProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  hasWarning?: boolean;
  hasError?: boolean;
}

export function EditableNumberCell({ value, onChange, min, max, hasWarning, hasError }: EditableNumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value.toString());
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue) && (min === undefined || numValue >= min) && (max === undefined || numValue <= max)) {
      onChange(numValue);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.toString());
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={editValue}
        min={min}
        max={max}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className={`w-full px-1 py-0.5 text-xs border rounded outline-none ${
          hasError
            ? 'border-red-400 bg-red-50'
            : hasWarning
              ? 'border-orange-400 bg-orange-50'
              : 'border-blue-400'
        }`}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`min-h-[20px] cursor-text px-1 py-0.5 rounded text-center ${
        hasError
          ? 'text-red-600 bg-red-50 hover:bg-red-100'
          : hasWarning
            ? 'text-orange-600 bg-orange-50 hover:bg-orange-100'
            : 'text-text-primary hover:bg-gray-50'
      }`}
    >
      {value}
    </div>
  );
}
