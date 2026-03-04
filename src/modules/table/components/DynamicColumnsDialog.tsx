import type { DynamicColumn } from '@/lib/types';

type DynamicDisplayType = DynamicColumn['type'] | 'progress' | 'stars';

interface DynamicColumnsDialogProps {
  newColumnDialog: {
    open: boolean;
    position: number;
    name: string;
    type: DynamicDisplayType;
  } | null;
  setNewColumnDialog: (dialog: DynamicColumnsDialogProps['newColumnDialog']) => void;
  editingColumnName: string;
  setEditingColumnName: (name: string) => void;
  editingColumnId: string | null;
  setEditingColumnId: (id: string | null) => void;
  dynamicColumns: DynamicColumn[];
  setDynamicColumns: (columns: DynamicColumn[]) => void;
  columnValidationToast: { type: 'error'; message: string } | null;
  setColumnValidationToast: (toast: { type: 'error'; message: string } | null) => void;
  onCreateColumn: (position: number, name: string, type: DynamicDisplayType) => Promise<void>;
}

export function DynamicColumnsDialog({
  newColumnDialog,
  setNewColumnDialog,
  editingColumnName,
  setEditingColumnName,
  editingColumnId,
  setEditingColumnId,
  dynamicColumns,
  setDynamicColumns,
  columnValidationToast,
  setColumnValidationToast,
  onCreateColumn,
}: DynamicColumnsDialogProps) {
  if (!newColumnDialog?.open) return null;

  const dynamicDisplayLabelEs: Record<DynamicDisplayType, string> = {
    text: 'Texto',
    number: 'NÃºmero',
    date: 'Fecha',
    select: 'SelecciÃ³n',
    tags: 'Etiquetas',
    checkbox: 'Casilla',
    progress: 'Progreso',
    stars: 'Estrellas',
  };

  const submitCreateDynamicColumn = async () => {
    const name = newColumnDialog.name.trim();
    if (!name) return;
    await onCreateColumn(newColumnDialog.position, name, newColumnDialog.type);
    setNewColumnDialog(null);
  };

  return (
    <div className="fixed inset-0 z-[230] bg-black/30 flex items-center justify-center p-4" data-column-menu-safe>
      <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-2xl p-4" data-column-menu-safe>
        <div className="text-sm font-semibold text-text-primary">Nueva columna</div>
        <label className="block text-xs text-text-secondary mt-3 mb-1">Nombre</label>
        <input
          autoFocus
          value={newColumnDialog.name}
          onChange={(e) => setNewColumnDialog((prev: any) => (prev ? { ...prev, name: e.target.value } : prev))}
          placeholder="Nombre de la columna"
          className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitCreateDynamicColumn();
            }
          }}
        />
        <label className="block text-xs text-text-secondary mt-3 mb-1">Tipo</label>
        <select
          value={newColumnDialog.type}
          onChange={(e) => setNewColumnDialog((prev: any) => (prev ? { ...prev, type: e.target.value as DynamicDisplayType } : prev))}
          className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 bg-white"
        >
          {(['text', 'progress', 'stars', 'number', 'date', 'tags', 'checkbox'] as DynamicDisplayType[]).map((t) => (
            <option key={t} value={t}>{dynamicDisplayLabelEs[t]}</option>
          ))}
        </select>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-bg-secondary"
            onClick={() => setNewColumnDialog(null)}
          >
            Cancelar
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded-md text-white bg-text-primary hover:bg-[#2c2a25]"
            onClick={() => { void submitCreateDynamicColumn(); }}
          >
            Crear columna
          </button>
        </div>
      </div>
    </div>
  );
}

