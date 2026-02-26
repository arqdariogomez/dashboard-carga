import { useState, useRef, useEffect } from 'react';
import { format } from '@/lib/dateUtils';

interface EditableDateCellProps {
  value: Date | null;
  onChange: (value: string | null) => void;
  hasError?: boolean;
}

export function EditableDateCell({ value, onChange, hasError }: EditableDateCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ? format(value, 'yyyy-MM-dd') : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value ? format(value, 'yyyy-MM-dd') : '');
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    if (editValue.trim()) {
      try {
        const parsed = new Date(editValue);
        if (!isNaN(parsed.getTime())) {
          onChange(editValue);
        }
      } catch {
        // Invalid date, keep editing
        return;
      }
    } else {
      onChange(null);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value ? format(value, 'yyyy-MM-dd') : '');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className={`w-full px-1 py-0.5 text-xs border rounded outline-none ${
          hasError ? 'border-red-400 bg-red-50' : 'border-blue-400'
        }`}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`min-h-[20px] cursor-text px-1 py-0.5 rounded text-center ${
        hasError ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-text-primary hover:bg-gray-50'
      }`}
    >
      {value ? format(value, 'dd/MM/yy') : <span className="text-gray-400">—</span>}
    </div>
  );
}
