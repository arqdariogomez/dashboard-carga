import { useState, useRef, useEffect } from 'react';

interface EditableTextCellProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function EditableTextCell({ value, onChange, placeholder }: EditableTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded text-text-primary"
    >
      {value || <span className="text-gray-400">{placeholder || 'Click para editar...'}</span>}
    </div>
  );
}
