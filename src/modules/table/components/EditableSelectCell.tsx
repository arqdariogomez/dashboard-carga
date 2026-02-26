import { useState, useRef, useEffect } from 'react';

interface EditableSelectCellProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export function EditableSelectCell({ value, onChange, options, placeholder }: EditableSelectCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    onChange(editValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-text-primary"
    >
      {value || <span className="text-gray-400">{placeholder || 'Seleccionar...'}</span>}
    </div>
  );
}
