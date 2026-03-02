import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
import { useUiFeedback } from '@/context/UiFeedbackContext';
import {
  RefreshCw,
  Undo2,
  Redo2,
  LogIn,
  LogOut,
  ChevronDown,
  Plus,
  Pencil,
  Save,
  Copy,
  Share2,
  Trash2,
  FolderOpen,
  MoreHorizontal,
  History,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

function formatUiError(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const message = typeof anyErr.message === 'string' ? anyErr.message : null;
    const code = typeof anyErr.code === 'string' ? anyErr.code : null;
    const details = typeof anyErr.details === 'string' ? anyErr.details : null;
    const hint = typeof anyErr.hint === 'string' ? anyErr.hint : null;
    return [message, code, details, hint].filter(Boolean).join(' | ') || JSON.stringify(anyErr);
  }
  return String(err);
}

interface HeaderProps {
  onReload?: () => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onImport?: () => void;
}

export function Header({ onReload, fileInputRef, onImport }: HeaderProps) {
  const {
    state,
    dispatch,
    canUndo,
    canRedo,
    undoCount,
    boards,
    activeBoardId,
    canEditActiveBoard,
    realtimeSyncState,
    selectBoard,
    createBoard,
    renameBoardById,
    duplicateBoardById,
    deleteBoardById,
    saveActiveBoardNow,
    versionHistory,
    createVersionSnapshot,
    restoreVersionSnapshot,
    getVersionSnapshot,
    versionHistorySync,
    copyBoardLink,
    inviteMemberByEmail,
  } = useProject();
  const { user, isConfigured, signInWithGoogle, signOut, updateAvatar } = useAuth();
  const { toast, promptText, confirm } = useUiFeedback();

  const canUseCloud = isConfigured && !!user;
  const hasActiveBoard = !!activeBoardId;
  const canManageBoard = hasActiveBoard && canEditActiveBoard;
  const [menuOpen, setMenuOpen] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewOnlyChanges, setPreviewOnlyChanges] = useState(true);
  const [query, setQuery] = useState('');
  const [rowMenuBoardId, setRowMenuBoardId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, setTimeTick] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) setMenuOpen(false);
      if (rowMenuRef.current && !rowMenuRef.current.contains(ev.target as Node)) {
        setRowMenuBoardId(null);
        setRowMenuPos(null);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(ev.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (!hasActiveBoard) return;
      try {
        setSaveStatus('saving');
        await saveActiveBoardNow();
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus('idle'), 1200);
      } catch {
        setSaveStatus('error');
        window.setTimeout(() => setSaveStatus('idle'), 1800);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasActiveBoard, saveActiveBoardNow]);

  // Re-render periodically so "hace X..." updates even without user actions.
  useEffect(() => {
    const id = window.setInterval(() => setTimeTick((v) => v + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const previewSnapshot = previewVersionId ? getVersionSnapshot(previewVersionId) : null;
  const previewOrderMap = useMemo(
    () => new Map((previewSnapshot?.projectOrder || []).map((id, idx) => [id, idx])),
    [previewSnapshot]
  );
  const previewProjectsOrdered = useMemo(() => {
    if (!previewSnapshot) return [];
    return [...previewSnapshot.projects].sort((a, b) => {
      const ai = previewOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = previewOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [previewSnapshot, previewOrderMap]);
  const currentById = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const previewDiffById = useMemo(() => {
    const map = new Map<string, { changed: boolean; fields: string[] }>();
    previewProjectsOrdered.forEach((p) => {
      const curr = currentById.get(p.id);
      const fields: string[] = [];
      const branchValue = Array.isArray(p.branch) ? p.branch.join('|') : p.branch;
      const currentBranchValue = curr ? (Array.isArray(curr.branch) ? curr.branch.join('|') : curr.branch) : '';
      if (!curr) fields.push('new');
      if (!curr || curr.name !== p.name) fields.push('name');
      if (!curr || currentBranchValue !== branchValue) fields.push('branch');
      if (!curr || (curr.startDate?.toISOString().slice(0, 10) || '') !== (p.startDate?.toISOString().slice(0, 10) || '')) fields.push('startDate');
      if (!curr || (curr.endDate?.toISOString().slice(0, 10) || '') !== (p.endDate?.toISOString().slice(0, 10) || '')) fields.push('endDate');
      if (!curr || (curr.assignees || []).join('|') !== (p.assignees || []).join('|')) fields.push('assignees');
      if (!curr || curr.type !== p.type) fields.push('type');
      map.set(p.id, { changed: fields.length > 0, fields });
    });
    return map;
  }, [previewProjectsOrdered, currentById]);
  const previewChangedCount = useMemo(
    () => Array.from(previewDiffById.values()).filter((x) => x.changed).length,
    [previewDiffById]
  );
  const previewRowsToRender = useMemo(
    () => (previewOnlyChanges ? previewProjectsOrdered.filter((p) => previewDiffById.get(p.id)?.changed) : previewProjectsOrdered),
    [previewOnlyChanges, previewProjectsOrdered, previewDiffById]
  );
  const filteredBoards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) => b.name.toLowerCase().includes(q));
  }, [boards, query]);
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) || '';
  const userName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Usuario';
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('');

  const copyLinkByBoardId = async (boardId: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('board', boardId);
    await navigator.clipboard.writeText(url.toString());
  };

  const safeLastUpdatedLabel = (() => {
    if (!state.lastUpdated) return '';
    try {
      const d = state.lastUpdated instanceof Date ? state.lastUpdated : new Date(String(state.lastUpdated));
      if (Number.isNaN(d.getTime())) return '';
      return ` ${formatDistanceToNow(d, { addSuffix: true, locale: es })}`;
    } catch {
      return '';
    }
  })();

  const handleCreateBoard = async (closeOpenModal: boolean) => {
    const name = await promptText({ title: 'Nuevo tablero', label: 'Nombre del tablero', initialValue: '' });
    if (!name) return;
    try {
      await createBoard(name);
      setMenuOpen(false);
      if (closeOpenModal) {
        setOpenModal(false);
      }
      toast('success', 'Tablero creado.');
    } catch (err) {
      toast('error', `No se pudo crear el tablero: ${formatUiError(err)}`);
    }
  };

  return (
    <header className="h-14 border-b border-border/90 bg-white flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {canUseCloud && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 max-w-[44vw] px-2.5 py-1.5 text-sm font-medium text-text-primary rounded-lg hover:bg-bg-secondary transition-colors"
              title="Opciones de tablero"
            >
              <span className="truncate">{activeBoard?.name || 'Tablero sin nombre'}</span>
              <ChevronDown size={14} className="text-text-secondary" />
              {saveStatus === 'saving' ? (
                <span className="text-[11px] text-blue-600">Guardando...</span>
              ) : saveStatus === 'saved' ? (
                <span className="text-[11px] text-green-600">
                  Guardado{safeLastUpdatedLabel}
                </span>
              ) : saveStatus === 'error' ? (
                <span className="text-[11px] text-red-600">Error al guardar</span>
              ) : state.hasUnsavedChanges ? (
                <span className="text-[11px] text-slate-500">Editando</span>
              ) : (
                <span className="text-[11px] text-text-secondary">
                  Guardado{safeLastUpdatedLabel}
                </span>
              )}
              {realtimeSyncState !== 'disabled' && (
                <span className={`text-[10px] ml-1 ${realtimeSyncState === 'live' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {realtimeSyncState === 'live' ? 'En vivo' : 'Conexion inestable'}
                </span>
              )}
              {!canEditActiveBoard && (
                <span className="text-[10px] ml-1 text-slate-500">Solo lectura</span>
              )}
            </button>

            {menuOpen && (
              <div className="absolute left-0 mt-1.5 w-56 rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] z-[140] p-1.5">
                <button disabled={!canEditActiveBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => { void handleCreateBoard(false); }}>
                  <Plus size={14} /> Nuevo
                </button>
                <button className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2" onClick={() => { setOpenModal(true); setMenuOpen(false); }}>
                  <FolderOpen size={14} /> Abrir...
                </button>
                <button disabled={!canManageBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!canManageBoard) return; try { await saveActiveBoardNow(); setMenuOpen(false); toast('success', 'Tablero guardado.'); } catch (err) { toast('error', `No se pudo guardar: ${formatUiError(err)}`); } }}>
                  <Save size={14} /> Guardar ahora
                </button>
                <button disabled={!canManageBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!activeBoardId || !canManageBoard) return; const name = await promptText({ title: 'Guardar como', label: 'Nombre de la copia', initialValue: '' }); try { await duplicateBoardById(activeBoardId, name || undefined); setMenuOpen(false); toast('success', 'Copia creada.'); } catch (err) { toast('error', `No se pudo guardar como: ${formatUiError(err)}`); } }}>
                  <Copy size={14} /> Guardar como...
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!hasActiveBoard) return; try { await copyBoardLink(); setMenuOpen(false); toast('success', 'Enlace copiado.'); } catch (err) { toast('error', `No se pudo copiar enlace: ${formatUiError(err)}`); } }}>
                  <Copy size={14} /> Copiar enlace
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => { setVersionsModalOpen(true); setMenuOpen(false); }}>
                  <History size={14} /> Historial de versiones
                </button>
                <button disabled={!canManageBoard} className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!canManageBoard) return; const email = await promptText({ title: 'Compartir tablero', label: 'Correo del usuario' }); if (!email) return; const roleRaw = await promptText({ title: 'Rol del usuario', label: 'editor o viewer', initialValue: 'viewer' }); const role = roleRaw === 'editor' ? 'editor' : 'viewer'; try { await inviteMemberByEmail(email, role); toast('success', 'Invitacion aplicada correctamente.'); setMenuOpen(false); } catch (err) { toast('error', `No se pudo invitar: ${formatUiError(err)}`); } }}>
                  <Share2 size={14} /> Compartir
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  disabled={!canManageBoard}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={async () => {
                    if (!canManageBoard || !activeBoardId) return;
                    const ok = await confirm({
                      title: 'Eliminar tablero',
                      message: 'Esta accion no se puede deshacer.',
                      confirmText: 'Eliminar',
                      tone: 'danger',
                    });
                    if (!ok) return;
                    try {
                      await deleteBoardById(activeBoardId);
                      setMenuOpen(false);
                      toast('success', 'Tablero eliminado.');
                    } catch (err) {
                      toast('error', `No se pudo eliminar: ${formatUiError(err)}`);
                    }
                  }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {state.projects.length > 0 && (
          <div className="flex items-center gap-0.5 mr-1">
            <button onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo} className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary' : 'text-text-secondary/20 cursor-not-allowed'}`} title={`Deshacer (Ctrl+Z)${canUndo ? ` - ${undoCount} cambio${undoCount !== 1 ? 's' : ''}` : ''}`}>
              <Undo2 size={16} />
            </button>
            <button onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo} className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary' : 'text-text-secondary/20 cursor-not-allowed'}`} title="Rehacer (Ctrl+Shift+Z)">
              <Redo2 size={16} />
            </button>
          </div>
        )}

        {state.projects.length > 0 && (
          <button
            onClick={() => (onReload ? onReload() : fileInputRef?.current?.click())}
            className="h-8 w-8 inline-flex items-center justify-center text-text-secondary hover:text-text-primary bg-bg-secondary/90 hover:bg-white border border-border rounded-lg transition-all"
            title="Recargar"
          >
            <RefreshCw size={14} />
          </button>
        )}

        {!isConfigured ? (
          <span className="px-2.5 py-1.5 text-xs font-medium text-text-secondary/70 bg-bg-secondary border border-border rounded-md" title="Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local">Auth no configurado</span>
        ) : user ? (
          <div className="relative" ref={accountMenuRef}>
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              className="h-9 w-9 rounded-full border border-border bg-white overflow-hidden inline-flex items-center justify-center hover:ring-2 hover:ring-blue-100 transition-all"
              title={userName}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold text-text-secondary">{initials || 'U'}</span>
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await updateAvatar(file);
                  toast('success', 'Foto de perfil actualizada.');
                } catch (err) {
                  toast('error', `No se pudo actualizar la foto: ${formatUiError(err)}`);
                } finally {
                  e.currentTarget.value = '';
                }
              }}
            />
            {accountMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.08)] z-[170] p-1.5">
                <div className="px-2.5 py-2 border-b border-border">
                  <div className="text-xs font-medium text-text-primary truncate">{userName}</div>
                  <div className="text-[11px] text-text-secondary truncate">{user.email}</div>
                </div>
                <button
                  className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Pencil size={13} /> Cambiar foto de perfil
                </button>
                {onImport && (
                  <button
                    className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2"
                    onClick={onImport}
                  >
                    <FolderOpen size={13} /> Importar archivo
                  </button>
                )}
                <button
                  className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2 text-red-600"
                  onClick={signOut}
                >
                  <LogOut size={13} /> Cerrar sesion
                </button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={signInWithGoogle} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-text-primary text-white rounded-md hover:bg-[#2c2a25] transition-colors" title="Entrar con Google"><LogIn size={14} /> Iniciar sesion</button>
        )}
      </div>

      {openModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30" onClick={() => { setOpenModal(false); setRowMenuBoardId(null); setRowMenuPos(null); }}>
          <div className="w-[720px] max-w-[92vw] max-h-[80vh] rounded-xl border border-border bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold text-text-primary">Abrir tablero</div>
              <div className="flex items-center gap-2">
                <button
                  disabled={!canEditActiveBoard}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => { void handleCreateBoard(false); }}
                >
                  <Plus size={13} />
                  Nuevo
                </button>
                <button className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-secondary" onClick={() => setOpenModal(false)}>Cerrar</button>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-border">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tablero..." className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="overflow-auto max-h-[56vh]">
              {filteredBoards.map((b) => (
                <div key={b.id} className={`px-4 py-2.5 border-b border-border/60 flex items-center justify-between ${b.id === activeBoardId ? 'bg-bg-secondary/60' : 'hover:bg-bg-secondary/40'}`}>
                  <button className="text-left min-w-0 flex-1" onClick={() => { selectBoard(b.id); setOpenModal(false); setRowMenuBoardId(null); setRowMenuPos(null); }}>
                    <div className="text-sm text-text-primary truncate">{b.name}</div>
                    <div className="text-[11px] text-text-secondary truncate">{b.id}</div>
                  </button>
                  <div className="relative" ref={rowMenuBoardId === b.id ? rowMenuRef : null}>
                    <button
                      className="h-8 w-8 rounded-md border border-transparent hover:border-border hover:bg-white inline-flex items-center justify-center"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setRowMenuBoardId((v) => {
                          const next = v === b.id ? null : b.id;
                          if (!next) {
                            setRowMenuPos(null);
                            return next;
                          }
                          const menuWidth = 176;
                          const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
                          setRowMenuPos({ top: rect.bottom + 6, left });
                          return next;
                        });
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {rowMenuBoardId === b.id && rowMenuPos && (
                      <div
                        className="fixed w-44 rounded-md border border-border bg-white shadow-lg z-[190] p-1"
                        style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
                      >
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={() => { selectBoard(b.id); setOpenModal(false); setRowMenuBoardId(null); setRowMenuPos(null); }}>Abrir</button>
                        <button disabled={!canEditActiveBoard} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!canEditActiveBoard) return; const name = await promptText({ title: 'Renombrar tablero', label: 'Nuevo nombre', initialValue: b.name }); if (!name) return; try { await renameBoardById(b.id, name); setRowMenuBoardId(null); setRowMenuPos(null); toast('success', 'Tablero renombrado.'); } catch (err) { toast('error', `No se pudo renombrar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Pencil size={12} />Renombrar</span></button>
                        <button disabled={!canEditActiveBoard} className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!canEditActiveBoard) return; const name = await promptText({ title: 'Duplicar tablero', label: 'Nombre de la copia (opcional)', initialValue: `${b.name} (copia)` }); try { await duplicateBoardById(b.id, name || undefined); setRowMenuBoardId(null); setRowMenuPos(null); toast('success', 'Tablero duplicado.'); } catch (err) { toast('error', `No se pudo duplicar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Copy size={12} />Duplicar</span></button>
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={async () => { try { await copyLinkByBoardId(b.id); setRowMenuBoardId(null); setRowMenuPos(null); toast('success', 'Enlace copiado.'); } catch (err) { toast('error', `No se pudo copiar enlace: ${formatUiError(err)}`); } }}>Copiar enlace</button>
                        <button disabled={!canEditActiveBoard} className="w-full text-left px-2 py-1.5 text-xs rounded text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!canEditActiveBoard) return; const ok = await confirm({ title: 'Eliminar tablero', message: 'Esta accion no se puede deshacer.', confirmText: 'Eliminar', tone: 'danger' }); if (!ok) return; try { await deleteBoardById(b.id); setRowMenuBoardId(null); setRowMenuPos(null); toast('success', 'Tablero eliminado.'); } catch (err) { toast('error', `No se pudo eliminar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Trash2 size={12} />Eliminar</span></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredBoards.length === 0 && <div className="px-4 py-10 text-center text-sm text-text-secondary">No hay tableros para mostrar.</div>}
            </div>
          </div>
        </div>
      )}

      {versionsModalOpen && (
        <div className="fixed inset-0 z-[155] flex items-center justify-center bg-black/35" onClick={() => setVersionsModalOpen(false)}>
          <div className="w-[760px] max-w-[94vw] max-h-[82vh] rounded-xl border border-border bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold text-text-primary">Historial de versiones</div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] px-2 py-1 rounded border ${versionHistorySync === 'cloud' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-amber-700 border-amber-200 bg-amber-50'}`}>
                  {versionHistorySync === 'cloud' ? 'Sincronizado en nube' : 'Modo local'}
                </span>
                <button
                  disabled={!canManageBoard}
                  className="text-xs px-2.5 py-1 rounded border border-border hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (!canManageBoard) return;
                    createVersionSnapshot('Snapshot manual');
                    toast('success', 'Version creada.');
                  }}
                >
                  Crear version
                </button>
                <button className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-secondary" onClick={() => setVersionsModalOpen(false)}>Cerrar</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[68vh]">
              {versionHistory.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-text-secondary">Aun no hay versiones guardadas para este tablero.</div>
              ) : versionHistory.map((v) => (
                <div key={v.id} className="px-4 py-3 border-b border-border/70 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary truncate">{v.reason}</div>
                    <div className="text-[11px] text-text-secondary">
                      {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true, locale: es })} · {v.createdByLabel} · {v.projectCount} proyectos · {v.changedProjects} cambios
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-bg-secondary"
                      onClick={() => setPreviewVersionId(v.id)}
                    >
                      Preview
                    </button>
                    <button
                      disabled={!canManageBoard}
                      className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={async () => {
                        if (!canManageBoard) return;
                        const ok = await confirm({
                          title: 'Restaurar version',
                          message: 'Se reemplazara el estado actual del tablero por esta version.',
                          confirmText: 'Restaurar',
                          tone: 'danger',
                        });
                        if (!ok) return;
                        try {
                          createVersionSnapshot('Respaldo antes de restaurar version');
                          const restored = await restoreVersionSnapshot(v.id);
                          if (!restored) throw new Error('No se pudo restaurar la version seleccionada.');
                          await saveActiveBoardNow();
                          toast('success', 'Version restaurada correctamente.');
                          setVersionsModalOpen(false);
                        } catch (err) {
                          toast('error', `No se pudo restaurar: ${formatUiError(err)}`);
                        }
                      }}
                    >
                      Restaurar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewSnapshot && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/40" onClick={() => setPreviewVersionId(null)}>
          <div className="w-[980px] max-w-[96vw] max-h-[86vh] rounded-xl border border-border bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">Preview de version</div>
                <div className="text-[11px] text-text-secondary">
                  {previewSnapshot.reason} · {formatDistanceToNow(new Date(previewSnapshot.createdAt), { addSuffix: true, locale: es })} · {previewSnapshot.createdByLabel}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-secondary">{previewChangedCount} filas con cambios vs actual</span>
                <label className="text-[11px] text-text-secondary inline-flex items-center gap-1">
                  <input type="checkbox" checked={previewOnlyChanges} onChange={(e) => setPreviewOnlyChanges(e.target.checked)} />
                  Solo cambios
                </label>
                <button className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-secondary" onClick={() => setPreviewVersionId(null)}>Cerrar</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[74vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-border">
                  <tr className="text-left text-text-secondary">
                    <th className="px-3 py-2">Proyecto</th>
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2">Inicio</th>
                    <th className="px-3 py-2">Fin</th>
                    <th className="px-3 py-2">Personas</th>
                    <th className="px-3 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRowsToRender.map((p) => {
                    const diff = previewDiffById.get(p.id);
                    return (
                    <tr key={p.id} className={`border-b border-border/60 ${diff?.changed ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-3 py-2 text-text-primary">
                        {p.name}
                        {diff?.changed && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Cambio</span>}
                      </td>
                      <td className={`px-3 py-2 ${diff?.fields.includes('branch') ? 'text-amber-800 font-medium' : 'text-text-secondary'}`}>{Array.isArray(p.branch) ? p.branch.join(', ') : p.branch}</td>
                      <td className={`px-3 py-2 ${diff?.fields.includes('startDate') ? 'text-amber-800 font-medium' : 'text-text-secondary'}`}>{p.startDate ? new Date(p.startDate).toLocaleDateString('es-MX') : '-'}</td>
                      <td className={`px-3 py-2 ${diff?.fields.includes('endDate') ? 'text-amber-800 font-medium' : 'text-text-secondary'}`}>{p.endDate ? new Date(p.endDate).toLocaleDateString('es-MX') : '-'}</td>
                      <td className={`px-3 py-2 ${diff?.fields.includes('assignees') ? 'text-amber-800 font-medium' : 'text-text-secondary'}`}>{p.assignees.join(', ') || '-'}</td>
                      <td className={`px-3 py-2 ${diff?.fields.includes('type') ? 'text-amber-800 font-medium' : 'text-text-secondary'}`}>{p.type}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
