import { useState, useEffect, useMemo } from 'react';
import { Zap, Check, AlertTriangle } from 'lucide-react';
import { ColumnMappingCard } from '../ui/ColumnMappingCard';
import { detectColumnMappings, FIELD_DEFINITIONS } from '../helpers/columnDetector';
import type { ColumnMapping, DetectionResult } from '../helpers/columnDetector';
import type { ParsedSheetData } from './Step1_FileSelect';

interface Step2Props {
  sheetData: ParsedSheetData;
  onComplete: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  onQuickImport: (mappings: ColumnMapping[]) => void;
}

export function Step2_ColumnMapping({ sheetData, onComplete, onBack, onQuickImport }: Step2Props) {
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [showQuickBanner, setShowQuickBanner] = useState(false);

  // Run auto-detection on mount
  useEffect(() => {
    const result = detectColumnMappings(sheetData.headers, sheetData.rows);
    setMappings(result.mappings);
    setDetection(result);
    setShowQuickBanner(result.isQuickImportReady);
  }, [sheetData]);

  // Track used columns
  const usedColumns = useMemo(() => {
    const set = new Set<string>();
    mappings.forEach((m) => {
      if (m.field) set.add(m.excelColumn);
    });
    return set;
  }, [mappings]);

  // Handle mapping change
  const handleMap = (field: string, excelColumn: string | null) => {
    setMappings((prev) => {
      const updated = prev.map((m) => {
        // Remove old mapping for this field
        if (m.field === field) {
          return { ...m, field: null, confidence: 0, method: 'none' };
        }
        return m;
      });

      if (excelColumn) {
        // Assign the column to this field
        return updated.map((m) => {
          if (m.excelColumn === excelColumn) {
            return {
              ...m,
              field,
              confidence: 1.0,
              method: 'manual' as const,
            };
          }
          // Remove this field from any other column
          if (m.field === field) {
            return { ...m, field: null, confidence: 0, method: 'none' };
          }
          return m;
        });
      }

      return updated;
    });
  };

  // Check required fields
  const requiredFields = FIELD_DEFINITIONS.filter((f) => f.required);
  const mappedRequiredFields = requiredFields.filter((f) =>
    mappings.some((m) => m.field === f.field)
  );
  const allRequiredMapped = mappedRequiredFields.length === requiredFields.length;

  // Separate required from optional
  const optionalFields = FIELD_DEFINITIONS.filter((f) => !f.required);

  // Get mapping for a specific field
  const getMappingForField = (field: string): ColumnMapping | null => {
    return mappings.find((m) => m.field === field) || null;
  };

  // Count mapped fields
  const mappedCount = mappings.filter((m) => m.field).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Quick import banner */}
      {showQuickBanner && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-accent-green/30 border border-[#2D6A2E]/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2D6A2E] flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                ¡Columnas detectadas automáticamente!
              </p>
              <p className="text-xs text-text-secondary">
                {mappedCount} columnas mapeadas con alta confianza
              </p>
            </div>
          </div>
          <button
            onClick={() => onQuickImport(mappings)}
            className="px-4 py-2 rounded-lg bg-[#2D6A2E] text-white text-sm font-medium hover:bg-[#245623] transition-colors"
          >
            Importar directamente →
          </button>
        </div>
      )}

      {/* Main content: two columns */}
      <div className="flex gap-5 flex-col lg:flex-row">
        {/* Left: Field mappings (60%) */}
        <div className="flex-1 lg:w-3/5 space-y-4">
          {/* Status bar */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-text-secondary">
              Mapeados: <strong className="text-text-primary">{mappedCount}/{FIELD_DEFINITIONS.length}</strong>
            </span>
            {allRequiredMapped ? (
              <span className="flex items-center gap-1 text-[#2D6A2E]">
                <Check size={12} /> Campos requeridos completos
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#B71C1C]">
                <AlertTriangle size={12} /> Faltan campos requeridos
              </span>
            )}
            {detection && (
              <span className="text-text-secondary ml-auto">
                Confianza general: {Math.round(detection.overallConfidence * 100)}%
              </span>
            )}
          </div>

          {/* Required fields */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Campos requeridos
            </h3>
            <div className="space-y-2">
              {requiredFields.map((fieldDef) => (
                <ColumnMappingCard
                  key={fieldDef.field}
                  fieldDef={fieldDef}
                  mapping={getMappingForField(fieldDef.field)}
                  allColumns={sheetData.headers}
                  usedColumns={usedColumns}
                  onMap={handleMap}
                />
              ))}
            </div>
          </div>

          {/* Optional fields */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Campos opcionales
            </h3>
            <div className="space-y-2">
              {optionalFields.map((fieldDef) => (
                <ColumnMappingCard
                  key={fieldDef.field}
                  fieldDef={fieldDef}
                  mapping={getMappingForField(fieldDef.field)}
                  allColumns={sheetData.headers}
                  usedColumns={usedColumns}
                  onMap={handleMap}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Excel preview (40%) */}
        <div className="lg:w-2/5">
          <div className="sticky top-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Vista previa del archivo
            </h3>
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {sheetData.headers.map((header) => {
                        const isMapped = mappings.some(
                          (m) => m.excelColumn === header && m.field
                        );
                        return (
                          <th
                            key={header}
                            className={`px-2 py-1.5 text-left border-r border-b border-border last:border-r-0 whitespace-nowrap font-medium ${
                              isMapped
                                ? 'bg-accent-green/50 text-[#2D6A2E]'
                                : 'bg-bg-secondary text-text-secondary'
                            }`}
                          >
                            {header}
                            {isMapped && (
                              <span className="block text-[8px] opacity-70">
                                → {mappings.find((m) => m.excelColumn === header)?.field}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetData.rows.slice(0, 12).map((row, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-bg-secondary/30'}>
                        {sheetData.headers.map((header) => {
                          const val = row[header];
                          return (
                            <td
                              key={header}
                              className="px-2 py-1 border-r border-b border-border last:border-r-0 max-w-[120px] truncate text-text-primary"
                            >
                              {val instanceof Date
                                ? val.toLocaleDateString('es-MX')
                                : val != null
                                ? String(val).substring(0, 20)
                                : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheetData.rows.length > 12 && (
                <div className="px-2 py-1.5 text-center text-[10px] text-text-secondary bg-bg-secondary border-t border-border">
                  +{sheetData.rows.length - 12} filas más
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:bg-bg-secondary transition-colors"
        >
          ← Atrás
        </button>
        <button
          onClick={() => onComplete(mappings)}
          disabled={!allRequiredMapped}
          className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            allRequiredMapped
              ? 'bg-text-primary text-white hover:bg-text-primary/90'
              : 'bg-bg-secondary text-text-secondary cursor-not-allowed'
          }`}
        >
          Siguiente: Vista previa →
        </button>
      </div>
    </div>
  );
}
