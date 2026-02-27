import { Search, Plus, Download, ClipboardCopy, ChevronRight, ChevronDown } from 'lucide-react';
import { BulkMenu } from './BulkMenu';

interface TableToolsProps {
  search: string;
  setSearch: (value: string) => void;
  projectsCount: number;
  multiSelectMode: boolean;
  selectedRowId: string | null;
  selectedRowIds: Set<string>;
  bulkMenuOpen: boolean;
  bulkMenuRef: React.RefObject<HTMLDivElement>;
  renderedProjectIds: string[];
  onMultiSelectModeToggle: () => void;
  onClearSelection: () => void;
  onBulkMenuToggle: () => void;
  onSelectAll: () => void;
  onBulkIndent: () => Promise<void>;
  onBulkOutdent: () => Promise<void>;
  onBulkDuplicate: () => void;
  onBulkDelete: () => Promise<void>;
  onAddProject: () => void;
  onExportExcel: () => void;
  onCopyCSV: () => void;
  onAddColumn: () => void;
  showUnscheduled?: boolean;
  setShowUnscheduled?: (show: boolean) => void;
  unscheduledCount?: number;
  showRadar?: boolean;
  setShowRadar?: (show: boolean) => void;
  radarCount?: number;
}

export function TableTools({
  search,
  setSearch,
  projectsCount,
  multiSelectMode,
  selectedRowId,
  selectedRowIds,
  bulkMenuOpen,
  bulkMenuRef,
  renderedProjectIds,
  onMultiSelectModeToggle,
  onClearSelection,
  onBulkMenuToggle,
  onSelectAll,
  onBulkIndent,
  onBulkOutdent,
  onBulkDuplicate,
  onBulkDelete,
  onAddProject,
  onExportExcel,
  onCopyCSV,
  onAddColumn,
  showUnscheduled = true,
  setShowUnscheduled,
  unscheduledCount = 0,
  showRadar = false,
  setShowRadar,
  radarCount = 0,
}: TableToolsProps) {
  return (
    <div className="py-2.5 pl-6 flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar proyecto..."
          className="w-full pl-8 pr-3 py-2 border border-border rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-person-1/25 focus:border-person-1"
        />
      </div>

      <span className="text-xs text-text-secondary">
        {projectsCount} proyectos
      </span>

      {/* Unscheduled toggle */}
      {setShowUnscheduled && unscheduledCount > 0 && (
        <button
          onClick={() => setShowUnscheduled(!showUnscheduled)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
            showUnscheduled
              ? 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]'
              : 'bg-white border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
          title={showUnscheduled ? 'Ocultar proyectos sin fecha' : 'Mostrar proyectos sin fecha'}
        >
          {showUnscheduled ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Sin fecha ({unscheduledCount})
        </button>
      )}

      {/* Radar toggle */}
      {setShowRadar && radarCount > 0 && (
        <button
          onClick={() => setShowRadar(!showRadar)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
            showRadar
              ? 'bg-[#E0E7FF] border-[#A5B4FC] text-[#3730A3]'
              : 'bg-white border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
          title={showRadar ? 'Ocultar proyectos en radar' : 'Mostrar proyectos en radar'}
        >
          {showRadar ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          En radar ({radarCount})
        </button>
      )}

      <div className="flex-1" />

      <button
        onClick={onMultiSelectModeToggle}
        className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          multiSelectMode
            ? 'bg-[#EAF2FF] border-[#93C5FD] text-[#1E40AF] hover:bg-[#E1ECFF]'
            : 'bg-white border-border text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
        }`}
        title="Activar selección múltiple"
      >
        {multiSelectMode ? 'Salir selección múltiple' : 'Seleccionar varios'}
      </button>

      {(selectedRowId || selectedRowIds.size > 0) && (
        <button
          onClick={onClearSelection}
          className="px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-lg border border-border bg-white hover:bg-bg-secondary transition-colors"
          title="Deseleccionar"
        >
          Deseleccionar
        </button>
      )}
      
      {multiSelectMode && (
        <BulkMenu
          bulkMenuOpen={bulkMenuOpen}
          bulkMenuRef={bulkMenuRef}
          selectedRowIds={selectedRowIds}
          renderedProjectIds={renderedProjectIds}
          onBulkMenuToggle={onBulkMenuToggle}
          onSelectAll={onSelectAll}
          onBulkIndent={onBulkIndent}
          onBulkOutdent={onBulkOutdent}
          onBulkDuplicate={onBulkDuplicate}
          onBulkDelete={onBulkDelete}
        />
      )}

      {/* Add project button */}
      <button
        onClick={onAddProject}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-lg hover:bg-[#171B22] transition-colors"
      >
        <Plus size={14} />
        Nuevo proyecto
      </button>

      {/* Export buttons */}
      <button
        onClick={onExportExcel}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
        title="Exportar a Excel"
      >
        <Download size={14} />
        Excel
      </button>

      <button
        onClick={onCopyCSV}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
        title="Copiar como CSV al portapapeles"
      >
        <ClipboardCopy size={14} />
        CSV
      </button>

      <div className="relative" data-column-menu-safe>
        <button
          onClick={onAddColumn}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
          title="Agregar columna"
        >
          <Plus size={14} />
          Columna
        </button>
      </div>
    </div>
  );
}
