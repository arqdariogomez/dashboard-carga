import { useProject } from '@/context/ProjectContext';
import type { ViewType } from '@/lib/types';
import { BarChart3, LineChart, Table2, CalendarRange, Users, Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useState } from 'react';
import { ConfigModal } from '../dashboard/ConfigModal';

const navItems: { view: ViewType; label: string; icon: typeof BarChart3; disabled?: boolean }[] = [
  { view: 'grid', label: 'Vista de Carga', icon: BarChart3 },
  { view: 'chart', label: 'Grafico de Linea', icon: LineChart },
  { view: 'table', label: 'Tabla de Proyectos', icon: Table2 },
  { view: 'gantt', label: 'Linea de tiempo', icon: CalendarRange },
  { view: 'persons', label: 'Resumen por Persona', icon: Users },
];

export function Sidebar() {
  const { state, dispatch } = useProject();
  const [configOpen, setConfigOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const collapsed = state.sidebarCollapsed;
  const showOverlay = collapsed;
  const revealLabels = !collapsed || hoverExpanded;
  const overlayWidthClass = hoverExpanded ? 'w-56' : 'w-14';

  const renderSidebarContent = (showLabels: boolean, compactHeader = false) => (
    <>
      <div className="flex items-center justify-between px-3 py-4 border-b border-border">
        {showLabels && !compactHeader && (
          <h1 className="text-sm font-semibold text-text-primary truncate">
            Workload Dashboard
          </h1>
        )}
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-white/60 text-text-secondary transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {state.projects.length > 0 && navItems.map(({ view, label, icon: Icon, disabled }) => (
          <button
            key={view}
            disabled={disabled}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: view })}
            className={cn(
              'w-full h-9 flex items-center gap-2.5 px-2.5 rounded-md text-sm leading-none transition-all duration-150',
              state.activeView === view
                ? 'bg-white text-text-primary font-medium shadow-sm'
                : 'text-text-secondary hover:bg-white/50 hover:text-text-primary',
              disabled ? 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-text-secondary' : ''
            )}
            title={!showLabels ? label : undefined}
          >
            <span className="h-[18px] w-[18px] inline-flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="block" />
            </span>
            {showLabels && <span className="truncate whitespace-nowrap leading-none">{label}</span>}
          </button>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-border">
        <button
          onClick={() => setConfigOpen(true)}
          className="w-full h-9 flex items-center gap-2.5 px-2.5 rounded-md text-sm leading-none text-text-secondary hover:bg-white/50 hover:text-text-primary transition-all"
          title={!showLabels ? 'Configuracion' : undefined}
        >
          <span className="h-[18px] w-[18px] inline-flex items-center justify-center flex-shrink-0">
            <Settings size={18} className="block" />
          </span>
          {showLabels && <span className="truncate whitespace-nowrap leading-none">Configuracion</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          'relative h-screen bg-bg-secondary border-r border-border transition-all duration-200 flex-shrink-0 z-[200]',
          collapsed ? 'w-14' : 'w-56'
        )}
        onMouseEnter={() => { if (collapsed) setHoverExpanded(true); }}
        onMouseLeave={() => { if (collapsed) setHoverExpanded(false); }}
      >
        <div className={cn('h-full flex flex-col bg-bg-secondary', collapsed ? 'w-14' : 'w-56')}>
          {renderSidebarContent(!collapsed, collapsed)}
        </div>
        {showOverlay && (
          <div
            className={cn(
              'absolute left-0 top-0 h-full z-[260] flex flex-col bg-bg-secondary border-r border-border overflow-hidden shadow-[4px_0_12px_rgba(15,23,42,0.05)] transition-[width,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
              overlayWidthClass
            )}
          >
            {renderSidebarContent(revealLabels, true)}
          </div>
        )}
      </aside>
      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}
    </>
  );
}
