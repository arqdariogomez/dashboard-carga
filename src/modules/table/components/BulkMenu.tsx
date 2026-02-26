import { ChevronLeft, Copy, Trash2, ChevronRight } from 'lucide-react';

interface BulkMenuProps {
  bulkMenuOpen: boolean;
  bulkMenuRef: React.RefObject<HTMLDivElement>;
  selectedRowIds: Set<string>;
  renderedProjectIds: string[];
  onBulkMenuToggle: () => void;
  onSelectAll: () => void;
  onBulkIndent: () => Promise<void>;
  onBulkOutdent: () => Promise<void>;
  onBulkDuplicate: () => void;
  onBulkDelete: () => Promise<void>;
}

export function BulkMenu({
  bulkMenuOpen,
  bulkMenuRef,
  selectedRowIds,
  renderedProjectIds,
  onBulkMenuToggle,
  onSelectAll,
  onBulkIndent,
  onBulkOutdent,
  onBulkDuplicate,
  onBulkDelete,
}: BulkMenuProps) {
  return (
    <div className="relative" ref={bulkMenuRef}>
      <button
        onClick={onBulkMenuToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-white hover:bg-bg-secondary border border-border rounded-lg transition-all"
        title="Acciones de seleccion multiple"
      >
        Acciones ({selectedRowIds.size})
      </button>
      {bulkMenuOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] p-1.5">
          <button
            disabled={renderedProjectIds.length === 0}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => { onSelectAll(); onBulkMenuToggle(); }}
          >
            Seleccionar todos ({renderedProjectIds.length})
          </button>
          <button 
            disabled={selectedRowIds.size === 0} 
            className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" 
            onClick={async () => { await onBulkIndent(); onBulkMenuToggle(); }}
          >
            <ChevronRight size={13} /> Poner en grupo
          </button>
          <button 
            disabled={selectedRowIds.size === 0} 
            className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" 
            onClick={async () => { await onBulkOutdent(); onBulkMenuToggle(); }}
          >
            <ChevronLeft size={13} /> Sacar de grupo
          </button>
          <button 
            disabled={selectedRowIds.size === 0} 
            className="w-full text-left px-2.5 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" 
            onClick={() => { onBulkDuplicate(); onBulkMenuToggle(); }}
          >
            <Copy size={13} /> Duplicar
          </button>
          <button 
            disabled={selectedRowIds.size === 0} 
            className="w-full text-left px-2.5 py-1.5 text-xs rounded text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2" 
            onClick={async () => { await onBulkDelete(); onBulkMenuToggle(); }}
          >
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
