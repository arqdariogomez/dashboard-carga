import { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { useAuth } from '@/context/AuthContext';
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
    selectBoard,
    createBoard,
    renameBoardById,
    duplicateBoardById,
    deleteBoardById,
    saveActiveBoardNow,
    copyBoardLink,
    inviteMemberByEmail,
  } = useProject();
  const { user, isConfigured, signInWithGoogle, signOut, updateAvatar } = useAuth();

  const canUseCloud = isConfigured && !!user;
  const hasActiveBoard = !!activeBoardId;
  const [menuOpen, setMenuOpen] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [query, setQuery] = useState('');
  const [rowMenuBoardId, setRowMenuBoardId] = useState<string | null>(null);
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
      if (rowMenuRef.current && !rowMenuRef.current.contains(ev.target as Node)) setRowMenuBoardId(null);
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

  return (
    <header className="h-14 border-b border-border bg-white flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {canUseCloud && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 max-w-[44vw] px-1 py-1 text-sm font-medium text-text-primary"
              title="Opciones de tablero"
            >
              <span className="truncate">{activeBoard?.name || 'Tablero sin nombre'}</span>
              <ChevronDown size={14} className="text-text-secondary" />
              {saveStatus === 'saving' ? (
                <span className="text-[11px] text-blue-600">Guardando...</span>
              ) : saveStatus === 'saved' ? (
                <span className="text-[11px] text-green-600">
                  Guardado{state.lastUpdated ? ` ${formatDistanceToNow(state.lastUpdated, { addSuffix: true, locale: es })}` : ''}
                </span>
              ) : saveStatus === 'error' ? (
                <span className="text-[11px] text-red-600">Error al guardar</span>
              ) : state.hasUnsavedChanges ? (
                <span className="text-[11px] text-slate-500">Editando</span>
              ) : (
                <span className="text-[11px] text-text-secondary">
                  Guardado{state.lastUpdated ? ` ${formatDistanceToNow(state.lastUpdated, { addSuffix: true, locale: es })}` : ''}
                </span>
              )}
            </button>

            {menuOpen && (
              <div className="absolute left-0 mt-1 w-56 rounded-lg border border-border bg-white shadow-lg z-[140] p-1">
                <button className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2" onClick={async () => { const name = window.prompt('Nombre del nuevo tablero'); if (!name) return; try { await createBoard(name); setMenuOpen(false); } catch (err) { window.alert(`No se pudo crear el tablero: ${formatUiError(err)}`); } }}>
                  <Plus size={14} /> Nuevo
                </button>
                <button className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2" onClick={() => { setOpenModal(true); setMenuOpen(false); }}>
                  <FolderOpen size={14} /> Abrir...
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!hasActiveBoard) return; try { await saveActiveBoardNow(); setMenuOpen(false); } catch (err) { window.alert(`No se pudo guardar: ${formatUiError(err)}`); } }}>
                  <Save size={14} /> Guardar ahora
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!activeBoardId) return; const name = window.prompt('Guardar como (nombre de la copia)'); try { await duplicateBoardById(activeBoardId, name || undefined); setMenuOpen(false); } catch (err) { window.alert(`No se pudo guardar como: ${formatUiError(err)}`); } }}>
                  <Copy size={14} /> Guardar como...
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!hasActiveBoard) return; try { await copyBoardLink(); setMenuOpen(false); } catch (err) { window.alert(`No se pudo copiar enlace: ${formatUiError(err)}`); } }}>
                  <Copy size={14} /> Copiar enlace
                </button>
                <button disabled={!hasActiveBoard} className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-bg-secondary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" onClick={async () => { if (!hasActiveBoard) return; const email = window.prompt('Correo del usuario a invitar'); if (!email) return; const roleRaw = window.prompt('Rol: editor o viewer', 'viewer'); const role = roleRaw === 'editor' ? 'editor' : 'viewer'; try { await inviteMemberByEmail(email, role); window.alert('Invitacion aplicada correctamente.'); setMenuOpen(false); } catch (err) { window.alert(`No se pudo invitar: ${formatUiError(err)}`); } }}>
                  <Share2 size={14} /> Compartir
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
            className="h-8 w-8 inline-flex items-center justify-center text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-white border border-border rounded-md transition-all"
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
                  window.alert('Foto de perfil actualizada.');
                } catch (err) {
                  window.alert(`No se pudo actualizar la foto: ${formatUiError(err)}`);
                } finally {
                  e.currentTarget.value = '';
                }
              }}
            />
            {accountMenuOpen && (
              <div className="absolute right-0 mt-1 w-56 rounded-lg border border-border bg-white shadow-lg z-[170] p-1">
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
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30" onClick={() => { setOpenModal(false); setRowMenuBoardId(null); }}>
          <div className="w-[720px] max-w-[92vw] max-h-[80vh] rounded-xl border border-border bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-semibold text-text-primary">Abrir tablero</div>
              <button className="text-xs px-2 py-1 rounded border border-border hover:bg-bg-secondary" onClick={() => setOpenModal(false)}>Cerrar</button>
            </div>
            <div className="px-4 py-3 border-b border-border">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tablero..." className="w-full h-9 rounded-md border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="overflow-auto max-h-[56vh]">
              {filteredBoards.map((b) => (
                <div key={b.id} className={`px-4 py-2.5 border-b border-border/60 flex items-center justify-between ${b.id === activeBoardId ? 'bg-bg-secondary/60' : 'hover:bg-bg-secondary/40'}`}>
                  <button className="text-left min-w-0 flex-1" onClick={() => { selectBoard(b.id); setOpenModal(false); setRowMenuBoardId(null); }}>
                    <div className="text-sm text-text-primary truncate">{b.name}</div>
                    <div className="text-[11px] text-text-secondary truncate">{b.id}</div>
                  </button>
                  <div className="relative" ref={rowMenuBoardId === b.id ? rowMenuRef : null}>
                    <button className="h-8 w-8 rounded-md border border-transparent hover:border-border hover:bg-white inline-flex items-center justify-center" onClick={() => setRowMenuBoardId((v) => (v === b.id ? null : b.id))}>
                      <MoreHorizontal size={14} />
                    </button>
                    {rowMenuBoardId === b.id && (
                      <div className="absolute right-0 top-9 w-44 rounded-md border border-border bg-white shadow-lg z-[160] p-1">
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={() => { selectBoard(b.id); setOpenModal(false); setRowMenuBoardId(null); }}>Abrir</button>
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={async () => { const name = window.prompt('Nuevo nombre del tablero', b.name); if (!name) return; try { await renameBoardById(b.id, name); setRowMenuBoardId(null); } catch (err) { window.alert(`No se pudo renombrar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Pencil size={12} />Renombrar</span></button>
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={async () => { const name = window.prompt('Nombre de la copia (opcional)'); try { await duplicateBoardById(b.id, name || undefined); setRowMenuBoardId(null); } catch (err) { window.alert(`No se pudo duplicar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Copy size={12} />Duplicar</span></button>
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-bg-secondary" onClick={async () => { try { await copyLinkByBoardId(b.id); setRowMenuBoardId(null); } catch (err) { window.alert(`No se pudo copiar enlace: ${formatUiError(err)}`); } }}>Copiar enlace</button>
                        <button className="w-full text-left px-2 py-1.5 text-xs rounded text-red-600 hover:bg-red-50" onClick={async () => { const ok = window.confirm('¿Eliminar este tablero? Esta accion no se puede deshacer.'); if (!ok) return; try { await deleteBoardById(b.id); setRowMenuBoardId(null); } catch (err) { window.alert(`No se pudo eliminar: ${formatUiError(err)}`); } }}><span className="inline-flex items-center gap-1"><Trash2 size={12} />Eliminar</span></button>
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
    </header>
  );
}
