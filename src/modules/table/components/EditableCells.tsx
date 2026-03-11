import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Plus } from 'lucide-react';
import type { DynamicColumn } from '@/lib/types';
import { formatDateShort } from '@/lib/dateUtils';

type DynamicCellValue = string | number | boolean | string[] | null;

// Helper functions
function normalizeProgressValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(100, n));
  return Math.round(clamped / 10) * 10;
}

function normalizeStarsValue(raw: DynamicCellValue): number | null {
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(5, n));
  return Math.round(clamped);
}

function isProgressColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'progress';
}

function isStarsColumn(column: DynamicColumn): boolean {
  return column.type === 'number' && column.config?.display === 'stars';
}

function normalizePersonKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// EditableTextCell
export function EditableTextCell({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value); }, [value]);

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors ${className || ''}`}
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value || <span className="text-text-secondary/50 italic">{placeholder || '—'}</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { setEditing(false); onChange(tempVal); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); onChange(tempVal); }
        if (e.key === 'Escape') { setEditing(false); setTempVal(value); }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
      placeholder={placeholder}
    />
  );
}

// EditableDateCell
export function EditableDateCell({
  value,
  onChange,
  hasError,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  hasError?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value || ''); }, [value]);
  const parsed = value ? new Date(`${value}T00:00:00`) : null;
  const formattedValue = parsed && !Number.isNaN(parsed.getTime()) ? formatDateShort(parsed) : value;

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors ${
          hasError ? 'text-red-600 bg-red-50' : ''
        }`}
        onClick={() => setEditing(true)}
        title="Clic para editar fecha"
      >
        {formattedValue || <span className="text-text-secondary/50 italic">—</span>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="date"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { 
        setEditing(false); 
        onChange(tempVal || null); 
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { 
          setEditing(false); 
          onChange(tempVal || null); 
        }
        if (e.key === 'Escape') { 
          setEditing(false); 
          setTempVal(value || ''); 
        }
      }}
      className={`w-full px-1.5 py-0.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white ${
        hasError ? 'border-red-300 bg-red-50' : 'border-person-1/40'
      }`}
    />
  );
}

// EditableNumberCell
export function EditableNumberCell({
  value,
  onChange,
  min,
  max,
  step,
  column,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  column?: DynamicColumn;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value?.toString() || ''); }, [value]);

  if (!editing) {
    let displayValue: string;
    if (value === null) {
      displayValue = '—';
    } else if (column && isProgressColumn(column)) {
      displayValue = `${value}%`;
    } else if (column && isStarsColumn(column)) {
      displayValue = '★'.repeat(value);
    } else {
      displayValue = value.toString();
    }

    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setEditing(true)}
        title="Clic para editar número"
      >
        {displayValue}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { 
        setEditing(false); 
        const num = tempVal === '' ? null : Number(tempVal);
        if (column && isProgressColumn(column)) {
          onChange(normalizeProgressValue(num));
        } else if (column && isStarsColumn(column)) {
          onChange(normalizeStarsValue(num));
        } else {
          onChange(num);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { 
          setEditing(false); 
          const num = tempVal === '' ? null : Number(tempVal);
          if (column && isProgressColumn(column)) {
            onChange(normalizeProgressValue(num));
          } else if (column && isStarsColumn(column)) {
            onChange(normalizeStarsValue(num));
          } else {
            onChange(num);
          }
        }
        if (e.key === 'Escape') { 
          setEditing(false); 
          setTempVal(value?.toString() || ''); 
        }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
      min={min}
      max={max}
      step={step}
    />
  );
}

// EditableSelectCell
export function EditableSelectCell({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) selectRef.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setEditing(true)}
        title="Clic para editar"
      >
        {value || <span className="text-text-secondary/50 italic">—</span>}
      </span>
    );
  }

  return (
    <select
      ref={selectRef}
      value={value || ''}
      onChange={(e) => { 
        setEditing(false); 
        onChange(e.target.value || null); 
      }}
      onBlur={() => setEditing(false)}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// EditableAssigneesCell
export function EditableAssigneesCell({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.join(', '));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value.join(', ')); }, [value]);

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors"
        onClick={() => setEditing(true)}
        title="Clic para editar asignados"
      >
        {value.length === 0 ? (
          <span className="text-text-secondary/50 italic">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {value.map((person, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-person-1/10 text-person-1 rounded text-[12px]">
                {person}
              </span>
            ))}
          </span>
        )}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { 
        setEditing(false); 
        const people = tempVal.split(',').map(p => p.trim()).filter(Boolean);
        onChange(people); 
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { 
          setEditing(false); 
          const people = tempVal.split(',').map(p => p.trim()).filter(Boolean);
          onChange(people); 
        }
        if (e.key === 'Escape') { 
          setEditing(false); 
          setTempVal(value.join(', ')); 
        }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
      placeholder="Separar por comas..."
    />
  );
}

// EditableBranchTagCell
export function EditableBranchTagCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
}: {
  value: string;
  options: string[];
  columnName: string;
  onChange: (v: string) => void;
  onAddOption: (label: string) => void;
  onRenameOption: (from: string, to: string) => void;
  onDeleteOption: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value);
  const [showOptions, setShowOptions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value); }, [value]);

  const handleOptionClick = (option: string) => {
    setTempVal(option);
    setEditing(false);
    onChange(option);
    setShowOptions(false);
  };

  const handleAddOption = () => {
    const newOption = `Nuevo ${columnName}`;
    onAddOption(newOption);
    setTempVal(newOption);
    onChange(newOption);
    setEditing(false);
    setShowOptions(false);
  };

  if (!editing) {
    return (
      <div className="relative">
        <span
          className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors inline-flex items-center gap-1"
          onClick={() => setEditing(true)}
          title="Clic para editar"
        >
          {value || <span className="text-text-secondary/50 italic">—</span>}
          <ChevronDown size={12} className="text-text-secondary/50" />
        </span>
        {showOptions && (
          <div
            ref={menuRef}
            className="absolute left-0 top-full mt-1 z-50 bg-white border border-person-1/20 rounded-lg shadow-lg p-1 min-w-[150px]"
          >
            {options.map((option) => (
              <button
                key={option}
                className="w-full text-left px-2 py-1 text-sm hover:bg-person-1/10 rounded transition-colors"
                onClick={() => handleOptionClick(option)}
              >
                {option}
              </button>
            ))}
            <button
              className="w-full text-left px-2 py-1 text-sm text-person-1 hover:bg-person-1/10 rounded transition-colors"
              onClick={handleAddOption}
            >
              + Nuevo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { 
        setEditing(false); 
        onChange(tempVal); 
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { 
          setEditing(false); 
          onChange(tempVal); 
        }
        if (e.key === 'Escape') { 
          setEditing(false); 
          setTempVal(value); 
        }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
    />
  );
}

// EditableTagsCell
export function EditableTagsCell({
  value,
  options,
  columnName,
  onChange,
  onAddOption,
  onRenameOption,
  onDeleteOption,
}: {
  value: string[];
  options: string[];
  columnName: string;
  onChange: (v: string[]) => void;
  onAddOption: (label: string) => void;
  onRenameOption: (from: string, to: string) => void;
  onDeleteOption: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.join(', '));
  const [showOptions, setShowOptions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setTempVal(value.join(', ')); }, [value]);

  const handleOptionToggle = (option: string) => {
    const newTags = tempVal.split(',').map(t => t.trim()).filter(Boolean);
    const optionIndex = newTags.indexOf(option);
    
    if (optionIndex >= 0) {
      newTags.splice(optionIndex, 1);
    } else {
      newTags.push(option);
    }
    
    setTempVal(newTags.join(', '));
    onChange(newTags);
  };

  const handleAddOption = () => {
    const newOption = `Nuevo ${columnName}`;
    onAddOption(newOption);
    const newTags = [...tempVal.split(',').map(t => t.trim()).filter(Boolean), newOption];
    setTempVal(newTags.join(', '));
    onChange(newTags);
    setEditing(false);
    setShowOptions(false);
  };

  if (!editing) {
    const currentTags = tempVal.split(',').map(t => t.trim()).filter(Boolean);
    return (
      <div className="relative">
        <span
          className="cursor-pointer hover:bg-accent-blue/20 rounded px-1 py-0.5 transition-colors inline-flex items-center gap-1"
          onClick={() => setEditing(true)}
          title="Clic para editar etiquetas"
        >
          {currentTags.length === 0 ? (
            <span className="text-text-secondary/50 italic">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {currentTags.map((tag, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-accent-blue/10 text-accent-blue rounded text-[12px]">
                  {tag}
                </span>
              ))}
            </span>
          )}
          <ChevronDown size={12} className="text-text-secondary/50" />
        </span>
        {showOptions && (
          <div
            ref={menuRef}
            className="absolute left-0 top-full mt-1 z-50 bg-white border border-person-1/20 rounded-lg shadow-lg p-1 min-w-[150px] max-h-[200px] overflow-y-auto"
          >
            {options.map((option) => (
              <button
                key={option}
                className={`w-full text-left px-2 py-1 text-sm hover:bg-person-1/10 rounded transition-colors flex items-center justify-between ${
                  currentTags.includes(option) ? 'bg-accent-blue/10 text-accent-blue' : ''
                }`}
                onClick={() => handleOptionToggle(option)}
              >
                <span>{option}</span>
                {currentTags.includes(option) && <span className="text-[12px]">?</span>}
              </button>
            ))}
            <button
              className="w-full text-left px-2 py-1 text-sm text-person-1 hover:bg-person-1/10 rounded transition-colors"
              onClick={handleAddOption}
            >
              + Nuevo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempVal}
      onChange={(e) => setTempVal(e.target.value)}
      onBlur={() => { 
        setEditing(false); 
        const tags = tempVal.split(',').map(t => t.trim()).filter(Boolean);
        onChange(tags); 
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { 
          setEditing(false); 
          const tags = tempVal.split(',').map(t => t.trim()).filter(Boolean);
          onChange(tags); 
        }
        if (e.key === 'Escape') { 
          setEditing(false); 
          setTempVal(value.join(', ')); 
        }
      }}
      className="w-full px-1.5 py-0.5 border border-person-1/40 rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 bg-white"
      placeholder="Separar por comas..."
    />
  );
}



