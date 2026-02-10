import { useState, useMemo } from 'react';
import { DataPreviewTable } from '../ui/DataPreviewTable';
import { ValidationMessage, ValidationSummary } from '../ui/ValidationMessage';
import { validateImportData } from '../helpers/validationEngine';
import { buildRawForValidation } from '../helpers/dataTransformer';
import { detectGroupRows } from '../helpers/indentDetector';
import { detectIndentLevels } from '../helpers/indentDetector';
import type { RowWithParent } from '../helpers/indentDetector';
import type { ColumnMapping } from '../helpers/columnDetector';
import type { ValidationIssue } from '../helpers/validationEngine';
import type { ParsedSheetData } from './Step1_FileSelect';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, Layers } from 'lucide-react';

interface Step3Props {
  sheetData: ParsedSheetData;
  mappings: ColumnMapping[];
  onComplete: (skipRows: number[]) => void;
  onBack: () => void;
}

export function Step3_DataPreview({ sheetData, mappings, onComplete, onBack }: Step3Props) {
  const [expandedSection, setExpandedSection] = useState<'errors' | 'warnings' | 'info' | null>('errors');
  const [skipGroupRows, setSkipGroupRows] = useState<number[]>([]);

  // Detect group rows
  const groupRows = useMemo(() => {
    return detectGroupRows(sheetData.rows, sheetData.headers);
  }, [sheetData]);

  // Auto-skip detected group rows
  useMemo(() => {
    if (groupRows.length > 0) {
      setSkipGroupRows(groupRows.map(g => g.rowIndex));
    }
  }, [groupRows]);

  // Build raw data for validation
  const rawProjects = useMemo(() => {
    return buildRawForValidation(sheetData.rows, mappings, skipGroupRows);
  }, [sheetData.rows, mappings, skipGroupRows]);

  // Hierarchy preview: compute parent mapping using indent levels (exceljs-provided or fallback)
  const hierarchyPreview = useMemo(() => {
    const nameCol = mappings.find(m => m.field === 'name')?.excelColumn || sheetData.headers[0];
    const indentLevelsAll = sheetData.indentLevelsByColumn ? sheetData.indentLevelsByColumn[nameCol] : undefined;

    // Build list of kept original indices after skipping group rows
    const keptIndices: number[] = [];
    for (let i = 0; i < sheetData.rows.length; i++) {
      if (!skipGroupRows.includes(i)) keptIndices.push(i);
    }

    // Get indent level map fallback using text-based detection
    const textIndentMap = detectIndentLevels(sheetData.rows, sheetData.headers[0]);

    // Build nodes array with indent and text
    const nodes: Array<{ originalIndex: number; text: string; indent: number }> = keptIndices.map((origIdx) => {
      const row = sheetData.rows[origIdx];
      const rawText = row[nameCol] ?? '';
      const text = String(rawText).trim();
      const indent = indentLevelsAll && typeof indentLevelsAll[origIdx] === 'number'
        ? indentLevelsAll[origIdx]
        : (textIndentMap.get(origIdx) ?? 0);
      return { originalIndex: origIdx, text, indent };
    });

    // Compute parent index within nodes array
    const parentIdxArr: number[] = new Array(nodes.length).fill(-1);
    for (let i = 0; i < nodes.length; i++) {
      const level = nodes[i].indent || 0;
      if (level === 0) { parentIdxArr[i] = -1; continue; }
      let p = -1;
      for (let j = i - 1; j >= 0; j--) {
        if ((nodes[j].indent || 0) === level - 1) { p = j; break; }
      }
      if (p === -1) {
        for (let j = i - 1; j >= 0; j--) {
          if ((nodes[j].indent || 0) < level) { p = j; break; }
        }
      }
      parentIdxArr[i] = p;
    }

    // Build children counts
    const childrenCount = new Array(nodes.length).fill(0);
    for (let i = 0; i < parentIdxArr.length; i++) {
      const p = parentIdxArr[i];
      if (p !== -1) childrenCount[p]++;
    }

    return { nodes, parentIdxArr, childrenCount };
  }, [sheetData, mappings, skipGroupRows]);

  // Run validation
  const validation = useMemo(() => {
    return validateImportData(rawProjects);
  }, [rawProjects]);

  const errors = validation.issues.filter(i => i.severity === 'error');
  const warnings = validation.issues.filter(i => i.severity === 'warning');
  const infos = validation.issues.filter(i => i.severity === 'info');

  const handleAutoFix = (_issue: ValidationIssue) => {
    // Auto-fix logic would be implemented here
    // For now, just acknowledge the action
  };

  const toggleSection = (section: 'errors' | 'warnings' | 'info') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const toggleGroupRow = (rowIndex: number) => {
    setSkipGroupRows(prev =>
      prev.includes(rowIndex)
        ? prev.filter(r => r !== rowIndex)
        : [...prev, rowIndex]
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Validation summary */}
      <ValidationSummary
        errorCount={validation.errorCount}
        warningCount={validation.warningCount}
        infoCount={validation.infoCount}
        validRowCount={validation.validRowCount}
        totalRowCount={validation.totalRowCount}
      />

      {/* Group rows detected */}
      {groupRows.length > 0 && (
        <div className="p-4 rounded-xl border border-border bg-accent-purple/20">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-person-4" />
            <h4 className="text-xs font-medium text-text-primary">
              {groupRows.length} fila{groupRows.length > 1 ? 's' : ''} de agrupación detectada{groupRows.length > 1 ? 's' : ''}
            </h4>
          </div>
          <p className="text-xs text-text-secondary mb-2">
            Estas filas parecen ser encabezados de grupo, no proyectos. Se excluirán de la importación:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groupRows.map((g) => (
              <button
                key={g.rowIndex}
                onClick={() => toggleGroupRow(g.rowIndex)}
                className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                  skipGroupRows.includes(g.rowIndex)
                    ? 'bg-accent-purple/30 border-person-4/30 text-person-4 line-through'
                    : 'bg-white border-border text-text-primary'
                }`}
              >
                Fila {g.rowIndex + 1}: "{g.label}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Issues sections */}
      <div className="space-y-2">
        {/* Errors */}
        {errors.length > 0 && (
          <div className="rounded-xl border border-[#B71C1C]/20 overflow-hidden">
            <button
              onClick={() => toggleSection('errors')}
              className="w-full flex items-center justify-between p-3 bg-accent-red/20 hover:bg-accent-red/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-[#B71C1C]" />
                <span className="text-sm font-medium text-[#B71C1C]">
                  {errors.length} error{errors.length !== 1 ? 'es' : ''}
                </span>
                <span className="text-xs text-[#B71C1C]/70">
                  — Impiden la importación
                </span>
              </div>
              {expandedSection === 'errors' ? (
                <ChevronUp size={14} className="text-[#B71C1C]" />
              ) : (
                <ChevronDown size={14} className="text-[#B71C1C]" />
              )}
            </button>
            {expandedSection === 'errors' && (
              <div className="p-3 space-y-1.5 bg-white">
                {errors.map((issue, idx) => (
                  <ValidationMessage key={idx} issue={issue} onAutoFix={handleAutoFix} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-[#7D6608]/20 overflow-hidden">
            <button
              onClick={() => toggleSection('warnings')}
              className="w-full flex items-center justify-between p-3 bg-accent-yellow/20 hover:bg-accent-yellow/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#7D6608]" />
                <span className="text-sm font-medium text-[#7D6608]">
                  {warnings.length} advertencia{warnings.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-[#7D6608]/70">
                  — Revisar pero no bloquean
                </span>
              </div>
              {expandedSection === 'warnings' ? (
                <ChevronUp size={14} className="text-[#7D6608]" />
              ) : (
                <ChevronDown size={14} className="text-[#7D6608]" />
              )}
            </button>
            {expandedSection === 'warnings' && (
              <div className="p-3 space-y-1.5 bg-white">
                {warnings.map((issue, idx) => (
                  <ValidationMessage key={idx} issue={issue} onAutoFix={handleAutoFix} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        {infos.length > 0 && (
          <div className="rounded-xl border border-[#1A5276]/20 overflow-hidden">
            <button
              onClick={() => toggleSection('info')}
              className="w-full flex items-center justify-between p-3 bg-accent-blue/20 hover:bg-accent-blue/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Info size={14} className="text-[#1A5276]" />
                <span className="text-sm font-medium text-[#1A5276]">
                  {infos.length} nota{infos.length !== 1 ? 's' : ''}
                </span>
              </div>
              {expandedSection === 'info' ? (
                <ChevronUp size={14} className="text-[#1A5276]" />
              ) : (
                <ChevronDown size={14} className="text-[#1A5276]" />
              )}
            </button>
            {expandedSection === 'info' && (
              <div className="p-3 space-y-1.5 bg-white">
                {infos.map((issue, idx) => (
                  <ValidationMessage key={idx} issue={issue} onAutoFix={handleAutoFix} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* No issues! */}
        {validation.issues.length === 0 && (
          <div className="p-6 rounded-xl border border-[#2D6A2E]/20 bg-accent-green/20 text-center">
            <p className="text-sm font-medium text-[#2D6A2E]">
              ✨ ¡Todo perfecto! No se encontraron problemas.
            </p>
          </div>
        )}
      </div>

      {/* Data preview table */}
      <div>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          Vista previa de datos ({rawProjects.length} filas)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <DataPreviewTable
              rows={sheetData.rows}
              headers={sheetData.headers}
              mappings={mappings}
              issues={validation.issues}
              maxRows={12}
            />
          </div>

          <div>
            <h4 className="text-xs font-medium text-text-primary mb-2">Vista previa de jerarquía</h4>
            <div className="p-3 rounded-xl border border-border bg-white max-h-[420px] overflow-auto text-sm">
              {hierarchyPreview.nodes.length === 0 ? (
                <p className="text-xs text-text-secondary">No hay filas para previsualizar.</p>
              ) : (
                <ul>
                  {hierarchyPreview.nodes.slice(0, 50).map((n, idx) => (
                    <li key={n.originalIndex} className="flex items-center gap-2" style={{ paddingLeft: `${(n.indent || 0) * 14}px` }}>
                      <div className="w-4 text-[11px] text-text-secondary">{hierarchyPreview.childrenCount[idx] > 0 ? '▸' : ''}</div>
                      <div className="truncate">{n.text}</div>
                    </li>
                  ))}
                </ul>
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
        <div className="flex items-center gap-2">
          {!validation.canImport && (
            <p className="text-xs text-[#B71C1C]">
              Corrige los errores para continuar
            </p>
          )}
          <button
            onClick={() => onComplete(skipGroupRows)}
            disabled={!validation.canImport}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              validation.canImport
                ? 'bg-text-primary text-white hover:bg-text-primary/90'
                : 'bg-bg-secondary text-text-secondary cursor-not-allowed'
            }`}
          >
            Importar {validation.validRowCount} proyectos →
          </button>
        </div>
      </div>
    </div>
  );
}
