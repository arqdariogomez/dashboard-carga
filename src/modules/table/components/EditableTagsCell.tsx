import { useState, useRef, useEffect } from 'react';
import { pastelTagColor } from '../utils/table.utils';

interface EditableTagsCellProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function EditableTagsCell({ value, onChange }: EditableTagsCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.join(', '));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value.join(', '));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    const tags = editValue.split(',').map(t => t.trim()).filter(Boolean);
    onChange(tags);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.join(', '));
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
        placeholder="Etiquetas separadas por comas..."
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[20px] cursor-text hover:bg-gray-50 px-1 py-0.5 rounded flex flex-wrap gap-1"
    >
      {value.length > 0 ? (
        value.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: pastelTagColor(tag).bg,
              color: pastelTagColor(tag).text,
              border: `1px solid ${pastelTagColor(tag).border}`,
            }}
          >
            {tag}
          </span>
        ))
      ) : (
        <span className="text-gray-400">Click para agregar etiquetas...</span>
      )}
    </div>
  );
}
