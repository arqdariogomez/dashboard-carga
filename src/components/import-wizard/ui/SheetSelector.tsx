import { FileSpreadsheet, Check, HelpCircle } from 'lucide-react';

export interface SheetInfo {
  name: string;
  rowCount: number;
  preview: unknown[][];  // first 3 rows × 5 columns
  hasProjectColumns: boolean;
  confidence: number;
}

interface SheetSelectorProps {
  sheets: SheetInfo[];
  selectedSheet: string | null;
  onSelect: (sheetName: string) => void;
}

export function SheetSelector({ sheets, selectedSheet, onSelect }: SheetSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <FileSpreadsheet size={18} className="text-text-secondary" />
        <h3 className="text-sm font-medium text-text-primary">
          Se encontraron {sheets.length} hojas — Selecciona una:
        </h3>
      </div>

      <div className="grid gap-3">
        {sheets.map((sheet) => {
          const isSelected = selectedSheet === sheet.name;
          
          return (
            <button
              key={sheet.name}
              onClick={() => onSelect(sheet.name)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'border-text-primary bg-bg-secondary shadow-sm ring-1 ring-text-primary/10'
                  : 'border-border bg-white hover:border-text-secondary hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-text-primary bg-text-primary'
                        : 'border-border'
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    {sheet.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">
                    {sheet.rowCount} filas
                  </span>
                  {sheet.hasProjectColumns ? (
                    <span className="flex items-center gap-1 text-xs text-[#2D6A2E] bg-accent-green px-2 py-0.5 rounded-full">
                      <Check size={10} /> Datos detectados
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-secondary bg-bg-secondary px-2 py-0.5 rounded-full">
                      <HelpCircle size={10} /> No detectado
                    </span>
                  )}
                </div>
              </div>

              {/* Mini preview table */}
              {sheet.preview.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[10px]">
                    <tbody>
                      {sheet.preview.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className={rowIdx === 0 ? 'bg-bg-secondary font-medium' : 'bg-white'}
                        >
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              className="px-2 py-1 border-r border-b border-border last:border-r-0 text-text-secondary truncate max-w-[120px]"
                            >
                              {cell != null ? String(cell).substring(0, 20) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
