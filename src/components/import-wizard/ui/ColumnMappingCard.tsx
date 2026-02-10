import { Check, AlertTriangle, ChevronDown, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { FieldDefinition } from '../helpers/columnDetector';
import type { ColumnMapping } from '../helpers/columnDetector';

interface ColumnMappingCardProps {
  fieldDef: FieldDefinition;
  mapping: ColumnMapping | null;
  allColumns: string[];
  usedColumns: Set<string>;
  onMap: (field: string, excelColumn: string | null) => void;
}

export function ColumnMappingCard({
  fieldDef,
  mapping,
  allColumns,
  usedColumns,
  onMap,
}: ColumnMappingCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isMapped = mapping !== null && mapping.field === fieldDef.field;
  const confidence = mapping?.confidence || 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const confidenceLabel = confidence >= 0.9
    ? 'Exacto'
    : confidence >= 0.7
    ? 'Alta'
    : confidence >= 0.5
    ? 'Media'
    : confidence > 0
    ? 'Baja'
    : '';

  const confidenceColor = confidence >= 0.7
    ? 'text-[#2D6A2E] bg-accent-green'
    : confidence >= 0.5
    ? 'text-[#7D6608] bg-accent-yellow'
    : confidence > 0
    ? 'text-[#8B4513] bg-accent-orange'
    : '';

  // Available columns (not used by other fields)
  const availableColumns = allColumns.filter(
    (col) => !usedColumns.has(col) || (mapping && mapping.excelColumn === col)
  );

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isMapped
          ? 'border-[#2D6A2E]/30 bg-accent-green/20'
          : fieldDef.required
          ? 'border-accent-red bg-accent-red/10'
          : 'border-border bg-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{fieldDef.icon}</span>
          <span className="text-sm font-medium text-text-primary">
            {fieldDef.label}
          </span>
          {fieldDef.required && (
            <span className="text-[10px] font-medium text-[#B71C1C] bg-accent-red px-1.5 py-0.5 rounded">
              Requerido
            </span>
          )}
        </div>
        {isMapped && (
          <div className="flex items-center gap-1.5">
            {confidence >= 0.7 ? (
              <Check size={14} className="text-[#2D6A2E]" />
            ) : (
              <AlertTriangle size={14} className="text-[#7D6608]" />
            )}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${confidenceColor}`}>
              {confidenceLabel} {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Column selector dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
            isMapped
              ? 'border-[#2D6A2E]/30 bg-white text-text-primary'
              : 'border-border bg-bg-secondary text-text-secondary hover:border-text-secondary'
          }`}
        >
          <span className={isMapped ? 'font-medium' : 'italic'}>
            {isMapped ? mapping?.excelColumn : 'Seleccionar columna...'}
          </span>
          <div className="flex items-center gap-1">
            {isMapped && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMap(fieldDef.field, null);
                }}
                className="p-0.5 rounded hover:bg-accent-red/30 transition-colors"
              >
                <X size={12} className="text-text-secondary" />
              </button>
            )}
            <ChevronDown size={14} className="text-text-secondary" />
          </div>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-lg border border-border shadow-lg max-h-48 overflow-y-auto">
            <button
              onClick={() => {
                onMap(fieldDef.field, null);
                setDropdownOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-secondary transition-colors italic"
            >
              — No mapear —
            </button>
            {availableColumns.map((col) => (
              <button
                key={col}
                onClick={() => {
                  onMap(fieldDef.field, col);
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  mapping?.excelColumn === col
                    ? 'bg-accent-blue text-[#1A5276] font-medium'
                    : 'text-text-primary hover:bg-bg-secondary'
                }`}
              >
                {col}
              </button>
            ))}
            {availableColumns.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-secondary italic">
                No hay columnas disponibles
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sample values preview */}
      {isMapped && mapping && mapping.sampleValues.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] text-text-secondary mb-1 flex items-center gap-1">
            Vista previa
            {mapping.detectedFormat && (
              <span className="px-1.5 py-0.5 rounded bg-accent-blue text-[#1A5276]">
                {mapping.detectedFormat}
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1">
            {mapping.sampleValues.slice(0, 4).map((val, idx) => (
              <span
                key={idx}
                className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border truncate max-w-[140px]"
              >
                {val instanceof Date
                  ? val.toLocaleDateString('es-MX')
                  : String(val ?? '')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
