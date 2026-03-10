import { useCallback, useRef, useState, useEffect } from 'react';
import { ProjectProvider, useProjectOptional } from '@/context/ProjectContext';
import { AuthProvider } from '@/context/AuthContext';
import { PersonProfilesProvider } from '@/context/PersonProfilesContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { FilterBar } from '@/components/layout/FilterBar';
import { ImportWizard } from '@/components/import-wizard/ImportWizard';
import { WorkloadGrid } from '@/components/dashboard/WorkloadGrid';
import { WorkloadLineChart } from '@/components/dashboard/WorkloadLineChart';
import { ProjectTable } from '@/components/dashboard/ProjectTable';
import { GanttTimeline } from '@/components/dashboard/GanttTimeline';
import { PersonSummaryCards } from '@/components/dashboard/PersonSummaryCard';
import { parseExcelFile } from '@/lib/parseExcel';
import { getPersons } from '@/lib/workloadEngine';
import { useAuth } from '@/context/AuthContext';
import { UiFeedbackProvider } from '@/context/UiFeedbackContext';
import React from 'react';

// File System Access API types
interface FileSystemFileHandle {
  getFile(): Promise<File>;
  name: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorText: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorText: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, errorText: String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('AppErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-bg-secondary p-4">
          <div className="w-full max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <div className="text-sm font-semibold">Error en la aplicacion</div>
            <div className="mt-2 text-xs break-words">{this.state.errorText}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 px-3 py-1.5 text-xs rounded-md border border-red-300 bg-white hover:bg-red-100"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardContent() {
  const projectCtx = useProjectOptional();
  const { loading: authLoading, isConfigured } = useAuth();
  if (!projectCtx) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary">
        <div className="text-sm text-text-secondary">Inicializando tablero...</div>
      </div>
    );
  }
  const { state, dispatch, isBoardLoading } = projectCtx;
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [reloadToast, setReloadToast] = useState<string | null>(null);
  const [mergeInfo, setMergeInfo] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoaded = useCallback((file: File) => {
    setLastFile(file);
  }, []);

  // Smart reload using File System Access API
  const handleReload = useCallback(async () => {
    try {
      // Try File System Access API first
      if (fileHandle) {
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const newProjects = parseExcelFile(buffer, state.config);
        const persons = getPersons(newProjects);

        // Compare with existing data for merge info
        const existingIds = new Set(state.projects.map(p => p.name));
        const newIds = new Set(newProjects.map(p => p.name));
        const addedCount = newProjects.filter(p => !existingIds.has(p.name)).length;
        const removedCount = state.projects.filter(p => !newIds.has(p.name)).length;
        const modifiedCount = newProjects.filter(p => {
          if (!existingIds.has(p.name)) return false;
          const existing = state.projects.find(ep => ep.name === p.name);
          if (!existing) return false;
          const sameAssignees = existing.assignees.length === p.assignees.length &&
            existing.assignees.every((a, i) => a === p.assignees[i]);
          return existing.daysRequired !== p.daysRequired ||
            !sameAssignees ||
            (existing.startDate?.getTime() || 0) !== (p.startDate?.getTime() || 0) ||
            (existing.endDate?.getTime() || 0) !== (p.endDate?.getTime() || 0);
        }).length;

        dispatch({ type: 'SET_PROJECTS', payload: { projects: newProjects, fileName: file.name } });

        const parts: string[] = [];
        if (addedCount > 0) parts.push(`${addedCount} nuevo${addedCount !== 1 ? 's' : ''}`);
        if (modifiedCount > 0) parts.push(`${modifiedCount} modificado${modifiedCount !== 1 ? 's' : ''}`);
        if (removedCount > 0) parts.push(`${removedCount} eliminado${removedCount !== 1 ? 's' : ''}`);

        if (parts.length > 0) {
          setMergeInfo(parts.join(', '));
          setTimeout(() => setMergeInfo(null), 5000);
        }

        setReloadToast(`✓ Actualizado: ${newProjects.length} proyectos, ${persons.length} personas`);
        setTimeout(() => setReloadToast(null), 3000);
        return;
      }

      // Fallback: try to use showOpenFilePicker
      if ('showOpenFilePicker' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [handle] = await (window as any).showOpenFilePicker({
            types: [{
              description: 'Excel files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
            }],
          });
          setFileHandle(handle);
          const file = await handle.getFile();
          setLastFile(file);
          const buffer = await file.arrayBuffer();
          const projects = parseExcelFile(buffer, state.config);
          const persons = getPersons(projects);
          dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: file.name } });
          setReloadToast(`✓ ${projects.length} proyectos cargados, ${persons.length} personas`);
          setTimeout(() => setReloadToast(null), 3000);
          return;
        } catch {
          // User cancelled or API not available, fall through
        }
      }

      // Final fallback: re-read the stored file or open file picker
      if (lastFile) {
        const buffer = await lastFile.arrayBuffer();
        const projects = parseExcelFile(buffer, state.config);
        const persons = getPersons(projects);
        dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: lastFile.name } });
        setReloadToast(`✓ Actualizado: ${projects.length} proyectos, ${persons.length} personas`);
        setTimeout(() => setReloadToast(null), 3000);
      } else if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } catch {
      setReloadToast('❌ Error al recargar');
      setTimeout(() => setReloadToast(null), 3000);
    }
  }, [fileHandle, lastFile, state.config, state.projects, dispatch]);

  const handleReloadFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLastFile(file);
      const buffer = await file.arrayBuffer();
      const projects = parseExcelFile(buffer, state.config);
      const persons = getPersons(projects);
      dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: file.name } });
      setReloadToast(`✓ ${projects.length} proyectos cargados, ${persons.length} personas`);
      setTimeout(() => setReloadToast(null), 3000);
    }
  }, [state.config, dispatch]);

  // Keyboard shortcut: Ctrl+R to reload
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r' && state.projects.length > 0) {
        e.preventDefault();
        handleReload();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleReload, state.projects.length]);

  const hasBoardParam = typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('board');

  const renderView = () => {
    if (isConfigured && authLoading && hasBoardParam) {
      return (
        <div className="flex-1 flex items-center justify-center bg-bg-secondary">
          <div className="text-sm text-text-secondary">Cargando tablero...</div>
        </div>
      );
    }

    if (isBoardLoading) {
      return (
        <div className="flex-1 flex items-center justify-center bg-bg-secondary">
          <div className="text-sm text-text-secondary">Cargando tablero...</div>
        </div>
      );
    }

    if (state.projects.length === 0 && !showImportWizard && !hasBoardParam) {
      return (
        <ImportWizard
          onComplete={(file) => {
            if (file) handleFileLoaded(file);
          }}
        />
      );
    }

    switch (state.activeView) {
      case 'grid': return <WorkloadGrid />;
      case 'chart': return <WorkloadLineChart />;
      case 'table': return <ProjectTable />;
      case 'gantt': return <GanttTimeline />;
      case 'persons': return <PersonSummaryCards />;
      default: return <WorkloadGrid />;
    }
  };

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onReload={handleReload}
          fileInputRef={fileInputRef}
          onImport={() => setShowImportWizard(true)}
        />
        {state.activeView !== 'gantt' && <FilterBar />}
        <div className="flex-1 flex flex-col overflow-hidden bg-bg-secondary rounded-l-2xl">
          {renderView()}
        </div>
      </div>

      {/* Hidden file input for reload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleReloadFileSelect}
        className="hidden"
      />

      {/* Import Wizard Modal */}
      {showImportWizard && (
        <ImportWizard
          isModal
          onComplete={() => setShowImportWizard(false)}
          onClose={() => setShowImportWizard(false)}
        />
      )}

      {/* Reload toast */}
      {reloadToast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-sm shadow-lg transition-all fade-in ${
          reloadToast.startsWith('✓')
            ? 'bg-accent-green text-[#2D6A2E]'
            : 'bg-accent-red text-[#B71C1C]'
        }`}>
          {reloadToast}
        </div>
      )}

      {/* Merge info toast */}
      {mergeInfo && (
        <div className="fixed bottom-16 right-4 z-50 px-4 py-3 rounded-lg text-sm shadow-lg bg-accent-blue text-[#1A5276] fade-in">
          📊 Cambios detectados: {mergeInfo}
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <UiFeedbackProvider>
        <PersonProfilesProvider>
          <AppErrorBoundary>
            <ProjectProvider>
              <DashboardContent />
            </ProjectProvider>
          </AppErrorBoundary>
        </PersonProfilesProvider>
      </UiFeedbackProvider>
    </AuthProvider>
  );
}
