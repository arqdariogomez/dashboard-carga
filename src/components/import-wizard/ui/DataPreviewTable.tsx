import type { ColumnMapping } from '../helpers/columnDetector';
import type { ValidationIssue } from '../helpers/validationEngine';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface DataPreviewTableProps {
  rows: Record<string, unknown>[];
  headers: string[];
  mappings: ColumnMapping[];
  issues: ValidationIssue[];
  maxRows?: number;
}

export function DataPreviewTable({
  rows,
  headers,
  mappings,
  issues,
  maxRows = 20,
}: DataPreviewTableProps) {
  const displayRows = rows.slice(0, maxRows);
  const mappedColumns = new Set(mappings.filter(m => m.field).map(m => m.excelColumn));

  const getRowIssues = (rowIndex: number): ValidationIssue[] => {
    return issues.filter(i => i.rowIndex === rowIndex);
  };

  const getFieldIssues = (rowIndex: number, header: string): ValidationIssue[] => {
    const mapping = mappings.find(m => m.excelColumn === header);
    if (!mapping?.field) return [];
    return issues.filter(i => i.rowIndex === rowIndex && i.field === mapping.field);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-bg-secondary">
              <th className="px-2 py-2 text-left text-[10px] font-medium text-text-secondary border-b border-r border-border w-8">
                #
              </th>
              {headers.map((header) => {
                const isMapped = mappedColumns.has(header);
                const mapping = mappings.find(m => m.excelColumn === header);
                return (
                  <th
                    key={header}
                    className={`px-2 py-2 text-left border-b border-r border-border last:border-r-0 min-w-[100px] ${
                      isMapped ? 'bg-accent-green/30' : ''
                    }`}
                  >
                    <div className="text-[10px] font-medium text-text-primary truncate">
                      {header}
                    </div>
                    {mapping?.field && (
                      <div className="text-[9px] text-[#2D6A2E] mt-0.5">
                        → {mapping.field}
                      </div>
                    )}
                  </th>
                );
              })}
              <th className="px-2 py-2 text-left text-[10px] font-medium text-text-secondary border-b border-border min-w-[60px]">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => {
              const rowIssues = getRowIssues(rowIdx);
              const hasError = rowIssues.some(i => i.severity === 'error');
              const hasWarning = rowIssues.some(i => i.severity === 'warning');

              return (
                <tr
                  key={rowIdx}
                  className={`transition-colors ${
                    hasError
                      ? 'bg-accent-red/20'
                      : hasWarning
                      ? 'bg-accent-yellow/20'
                      : rowIdx % 2 === 0
                      ? 'bg-white'
                      : 'bg-bg-secondary/30'
                  }`}
                >
                  <td className="px-2 py-1.5 text-text-secondary border-r border-b border-border tabular-nums">
                    {rowIdx + 1}
                  </td>
                  {headers.map((header) => {
                    const cellIssues = getFieldIssues(rowIdx, header);
                    const cellHasError = cellIssues.some(i => i.severity === 'error');
                    const cellHasWarning = cellIssues.some(i => i.severity === 'warning');
                    const val = row[header];

                    return (
                      <td
                        key={header}
                        className={`px-2 py-1.5 border-r border-b border-border last:border-r-0 max-w-[160px] truncate ${
                          cellHasError
                            ? 'ring-1 ring-inset ring-[#B71C1C]/30'
                            : cellHasWarning
                            ? 'ring-1 ring-inset ring-[#7D6608]/30'
                            : ''
                        }`}
                        title={cellIssues.length > 0 ? cellIssues.map(i => i.message).join('; ') : undefined}
                      >
                        <span className="text-text-primary">
                          {val instanceof Date
                            ? val.toLocaleDateString('es-MX')
                            : val != null
                            ? String(val).substring(0, 30)
                            : ''}
                        </span>
                        {(cellHasError || cellHasWarning) && (
                          <span className="ml-1 inline-block">
                            {cellHasError ? (
                              <AlertCircle size={10} className="text-[#B71C1C] inline" />
                            ) : (
                              <AlertTriangle size={10} className="text-[#7D6608] inline" />
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 border-b border-border">
                    {rowIssues.length === 0 ? (
                      <span className="text-[#2D6A2E]">✓</span>
                    ) : (
                      <div className="flex gap-0.5">
                        {hasError && <AlertCircle size={12} className="text-[#B71C1C]" />}
                        {hasWarning && !hasError && <AlertTriangle size={12} className="text-[#7D6608]" />}
                        {!hasError && !hasWarning && <Info size={12} className="text-person-1" />}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <div className="px-3 py-2 bg-bg-secondary text-xs text-text-secondary text-center border-t border-border">
          Mostrando {maxRows} de {rows.length} filas
        </div>
      )}
    </div>
  );
}
