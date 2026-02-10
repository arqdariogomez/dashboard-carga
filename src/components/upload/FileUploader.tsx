import { useState, useCallback, useRef } from 'react';
import { useProject } from '@/context/ProjectContext';
import { parseExcelFile, createProjectsFromSample } from '@/lib/parseExcel';
import { SAMPLE_DATA } from '@/lib/constants';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, Sparkles } from 'lucide-react';
import { getPersons } from '@/lib/workloadEngine';

interface FileUploaderProps {
  onFileLoaded?: (file: File) => void;
}

export function FileUploader({ onFileLoaded }: FileUploaderProps) {
  const { state, dispatch } = useProject();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const projects = parseExcelFile(buffer, state.config);
      const persons = getPersons(projects);
      dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: file.name } });
      setToast(`✓ ${projects.length} proyectos cargados, ${persons.length} personas detectadas`);
      if (onFileLoaded) onFileLoaded(file);
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast('❌ Error al leer el archivo. Verifica que sea un .xlsx válido.');
      setTimeout(() => setToast(null), 4000);
    }
    setLoading(false);
  }, [state.config, dispatch, onFileLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const loadSample = useCallback(() => {
    setLoading(true);
    const projects = createProjectsFromSample(SAMPLE_DATA, state.config);
    const persons = getPersons(projects);
    dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: 'datos-ejemplo.xlsx' } });
    setToast(`✓ ${projects.length} proyectos de ejemplo cargados, ${persons.length} personas`);
    setTimeout(() => setToast(null), 4000);
    setLoading(false);
  }, [state.config, dispatch]);

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-text-primary text-white mb-4">
            <FileSpreadsheet size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary mb-1">Workload Dashboard</h1>
          <p className="text-sm text-text-secondary">Visualiza y balancea cargas de trabajo</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer ${
            dragging
              ? 'border-person-1 bg-accent-blue/30'
              : 'border-border hover:border-text-secondary bg-white'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-person-1 animate-spin" />
              <p className="text-sm text-text-secondary">Procesando archivo...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload size={32} className="text-text-secondary" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Arrastra tu archivo Excel aquí
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  o haz clic para seleccionar (.xlsx)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-secondary">o</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Sample data button */}
        <button
          onClick={loadSample}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-white hover:bg-bg-secondary text-sm font-medium text-text-primary transition-all hover:shadow-sm"
        >
          <Sparkles size={16} className="text-person-4" />
          Cargar datos de ejemplo
        </button>

        {/* Toast */}
        {toast && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
            toast.startsWith('✓')
              ? 'bg-accent-green text-[#2D6A2E]'
              : 'bg-accent-red text-[#B71C1C]'
          }`}>
            {toast.startsWith('✓') && <CheckCircle size={16} />}
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
