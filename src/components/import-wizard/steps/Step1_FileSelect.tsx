import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { Upload, FileSpreadsheet, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { SheetSelector, type SheetInfo } from '../ui/SheetSelector';
import { detectHeaderRow } from '../helpers/columnDetector';

export interface ParsedSheetData {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  rawSheetData: unknown[][];
  headerRow: number;
  workbook: XLSX.WorkBook;
  indentLevelsByColumn?: Record<string, number[]>; // map header -> indent levels per data row
}

interface Step1Props {
  onComplete: (data: ParsedSheetData) => void;
  onLoadSample: () => void;
}

export function Step1_FileSelect({ onComplete, onLoadSample }: Step1Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [showHeaderConfig, setShowHeaderConfig] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [excelJsWorkbook, setExcelJsWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      setWorkbook(wb);

      // Also load ExcelJS workbook to read cell.alignment.indent for visual indentation
      try {
        const xlsxWb = new ExcelJS.Workbook();
        await xlsxWb.xlsx.load(buffer as any);
        setExcelJsWorkbook(xlsxWb);
      } catch (e) {
        // Non-fatal: indentation detection will fallback to text-based method
        setExcelJsWorkbook(null);
      }

      // Analyze all sheets
      const sheetInfos: SheetInfo[] = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

        // Get preview (first 3 rows × 5 columns)
        const preview = rawData.slice(0, 3).map((row) => {
          const r = row as unknown[];
          return r.slice(0, 5);
        });

        // Quick check if this looks like project data
        const firstRow = rawData[0] as unknown[] | undefined;
        let hasProjectColumns = false;
        if (firstRow) {
          const headerTexts = firstRow
            .filter((c) => c != null)
            .map((c) => String(c).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          const knownHeaders = ['proyecto', 'nombre', 'inicio', 'fin', 'asignado', 'dias', 'tipo', 'prioridad', 'sucursal'];
          hasProjectColumns = knownHeaders.some((h) => headerTexts.some((t) => t.includes(h)));
        }

        const confidence = hasProjectColumns ? 0.8 : 0.2;

        return {
          name,
          rowCount: jsonData.length,
          preview,
          hasProjectColumns,
          confidence,
        };
      });

      setSheets(sheetInfos);

      // Auto-select if only one sheet or one has high confidence
      if (sheetInfos.length === 1) {
        handleSheetSelect(sheetInfos[0].name, wb);
      } else {
        const bestSheet = sheetInfos.find((s) => s.hasProjectColumns);
        if (bestSheet) {
          setSelectedSheet(bestSheet.name);
        }
      }
    } catch {
      setError('Error al leer el archivo. Verifica que sea un archivo Excel válido (.xlsx, .xls) o CSV.');
    }
    setLoading(false);
  }, []);

  const handleSheetSelect = useCallback(
    (sheetName: string, wb?: XLSX.WorkBook) => {
      const activeWb = wb || workbook;
      if (!activeWb) return;

      setSelectedSheet(sheetName);
      const sheet = activeWb.Sheets[sheetName];

      // Detect header row
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
      const detectedRow = detectHeaderRow(rawData as unknown[][]);
      setHeaderRow(detectedRow);
    },
    [workbook]
  );

  const handleConfirmSheet = useCallback(() => {
    if (!workbook || !selectedSheet) return;

    const sheet = workbook.Sheets[selectedSheet];

    // Parse with specific header row
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const headerRowData = rawData[headerRow] as unknown[];

    if (!headerRowData) {
      setError('La fila de headers seleccionada está vacía');
      return;
    }

    // Get headers from the specified row
    const headers = headerRowData
      .map((h, idx) => (h != null && String(h).trim() !== '' ? String(h).trim() : `Columna_${idx + 1}`));

    // Get data rows (everything after header row)
    const dataRows = rawData.slice(headerRow + 1);
    const rows: Record<string, unknown>[] = dataRows
      .filter((row) => {
        const r = row as unknown[];
        return r.some((cell) => cell != null && cell !== '');
      })
      .map((row) => {
        const r = row as unknown[];
        const obj: Record<string, unknown> = {};
        headers.forEach((header, idx) => {
          obj[header] = idx < r.length ? r[idx] : null;
        });
        return obj;
      });

    onComplete({
      fileName: fileName || 'unknown.xlsx',
      sheetName: selectedSheet,
      headers,
      rows,
      rawSheetData: rawData as unknown[][],
      headerRow,
      workbook,
      indentLevelsByColumn: (function computeIndentMap() {
        try {
          if (!excelJsWorkbook) return undefined;
          const ws = excelJsWorkbook.getWorksheet(selectedSheet);
          if (!ws) return undefined;
          const map: Record<string, number[]> = {};
          for (let c = 0; c < headers.length; c++) {
            const colName = headers[c];
            const levels: number[] = [];
            for (let i = 0; i < rows.length; i++) {
              const excelRow = headerRow + 2 + i; // headerRow is 0-based, data rows start headerRow+1 (array), excel row = +1
              const cell = ws.getCell(excelRow, c + 1);
              const indent = cell && cell.alignment && (cell.alignment.indent || 0) ? (cell.alignment.indent || 0) : 0;
              levels.push(indent);
            }
            map[colName] = levels;
          }
          return map;
        } catch {
          return undefined;
        }
      })(),
    });
  }, [workbook, selectedSheet, headerRow, fileName, onComplete]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Drag & Drop zone */}
      {!fileName && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer ${
              dragging
                ? 'border-person-1 bg-accent-blue/30'
                : 'border-border hover:border-text-secondary bg-white'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={36} className="text-person-1 animate-spin" />
                <p className="text-sm text-text-secondary">Leyendo archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-bg-secondary flex items-center justify-center">
                  <Upload size={24} className="text-text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Arrastra tu archivo aquí
                  </p>
                  <p className="text-xs text-text-secondary mt-1">
                    .xlsx, .xls, o .csv
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-secondary">o</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Sample data button */}
          <button
            onClick={onLoadSample}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-white hover:bg-bg-secondary text-sm font-medium text-text-primary transition-all hover:shadow-sm"
          >
            <FileSpreadsheet size={16} className="text-person-4" />
            Cargar datos de ejemplo
          </button>
        </>
      )}

      {/* File loaded - sheet selection */}
      {fileName && sheets.length > 0 && (
        <div className="space-y-5">
          {/* File info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-accent-green/20 border border-[#2D6A2E]/20">
            <FileSpreadsheet size={20} className="text-[#2D6A2E]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">{fileName}</p>
              <p className="text-xs text-text-secondary">{sheets.length} hoja{sheets.length > 1 ? 's' : ''} encontrada{sheets.length > 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => {
                setFileName(null);
                setSheets([]);
                setSelectedSheet(null);
                setWorkbook(null);
              }}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              Cambiar archivo
            </button>
          </div>

          {/* Sheet selector (only if multiple) */}
          {sheets.length > 1 && (
            <SheetSelector
              sheets={sheets}
              selectedSheet={selectedSheet}
              onSelect={(name) => handleSheetSelect(name)}
            />
          )}

          {/* Header row configuration */}
          {selectedSheet && (
            <div className="space-y-3">
              <button
                onClick={() => setShowHeaderConfig(!showHeaderConfig)}
                className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {showHeaderConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Configuración avanzada
              </button>

              {showHeaderConfig && (
                <div className="p-4 rounded-xl border border-border bg-white space-y-3">
                  <div>
                    <label className="text-xs font-medium text-text-primary block mb-1">
                      Los headers están en la fila:
                    </label>
                    <select
                      value={headerRow}
                      onChange={(e) => setHeaderRow(parseInt(e.target.value))}
                      className="px-3 py-1.5 rounded-lg border border-border text-sm text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-text-primary/20"
                    >
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i} value={i}>
                          Fila {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Preview of detected headers */}
                  {workbook && selectedSheet && (
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Headers detectados:</p>
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const sheet = workbook.Sheets[selectedSheet];
                          const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
                          const row = rawData[headerRow] as unknown[] | undefined;
                          if (!row) return <span className="text-xs text-text-secondary italic">Fila vacía</span>;
                          return row
                            .filter((c) => c != null && String(c).trim() !== '')
                            .map((c, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] px-2 py-0.5 rounded bg-accent-blue text-[#1A5276] border border-[#1A5276]/10"
                              >
                                {String(c).trim()}
                              </span>
                            ));
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Continue button */}
              <button
                onClick={handleConfirmSheet}
                className="w-full px-4 py-3 rounded-xl bg-text-primary text-white text-sm font-medium hover:bg-text-primary/90 transition-colors"
              >
                Continuar con mapeo de columnas →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-accent-red text-[#B71C1C] text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
