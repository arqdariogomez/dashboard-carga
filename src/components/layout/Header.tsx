import { useProject } from '@/context/ProjectContext';
import { RefreshCw, Clock, Undo2, Redo2, Upload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface HeaderProps {
  onReload?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onImport?: () => void;
}

export function Header({ onReload, fileInputRef, onImport }: HeaderProps) {
  const { state, dispatch, canUndo, canRedo, undoCount } = useProject();

  const viewLabels: Record<string, string> = {
    grid: 'Vista de Carga',
    chart: 'Gráfico de Línea',
    table: 'Tabla de Proyectos',
    gantt: 'Timeline',
    persons: 'Resumen por Persona',
  };

  return (
    <header className="h-14 border-b border-border bg-white flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          {viewLabels[state.activeView] || 'Dashboard'}
          {/* Unsaved changes indicator */}
          {state.hasUnsavedChanges && (
            <span className="relative flex h-2.5 w-2.5" title="Cambios sin guardar">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
            </span>
          )}
        </h2>
        {state.fileName && (
          <span className="text-xs text-text-secondary bg-bg-secondary px-2 py-0.5 rounded">
            {state.fileName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Undo/Redo */}
        {state.projects.length > 0 && (
          <div className="flex items-center gap-0.5 mr-1">
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={!canUndo}
              className={`p-1.5 rounded-md transition-colors ${
                canUndo
                  ? 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                  : 'text-text-secondary/20 cursor-not-allowed'
              }`}
              title={`Deshacer (Ctrl+Z)${canUndo ? ` · ${undoCount} cambio${undoCount !== 1 ? 's' : ''}` : ''}`}
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={!canRedo}
              className={`p-1.5 rounded-md transition-colors ${
                canRedo
                  ? 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                  : 'text-text-secondary/20 cursor-not-allowed'
              }`}
              title="Rehacer (Ctrl+Shift+Z)"
            >
              <Redo2 size={16} />
            </button>
          </div>
        )}

        {state.lastUpdated && (
          <span className="text-xs text-text-secondary flex items-center gap-1">
            <Clock size={12} />
            {formatDistanceToNow(state.lastUpdated, { addSuffix: true, locale: es })}
          </span>
        )}
        {state.projects.length > 0 && (
          <button
            onClick={() => {
              if (onReload) {
                onReload();
              } else if (fileInputRef?.current) {
                fileInputRef.current.click();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-white border border-border rounded-md transition-all"
          >
            <RefreshCw size={14} />
            Recargar
          </button>
        )}
      </div>
    </header>
  );
}
