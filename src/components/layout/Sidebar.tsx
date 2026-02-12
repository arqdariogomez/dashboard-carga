import { useProject } from '@/context/ProjectContext';
import type { ViewType } from '@/lib/types';
import { BarChart3, LineChart, Table2, CalendarRange, Users, Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useState } from 'react';
import { ConfigModal } from '../dashboard/ConfigModal';

const navItems: { view: ViewType; label: string; icon: typeof BarChart3 }[] = [
  { view: 'grid', label: 'Vista de Carga', icon: BarChart3 },
  { view: 'chart', label: 'Gráfico de Línea', icon: LineChart },
  { view: 'table', label: 'Tabla de Proyectos', icon: Table2 },
  { view: 'gantt', label: 'Timeline', icon: CalendarRange },
  { view: 'persons', label: 'Resumen por Persona', icon: Users },
];

export function Sidebar() {
  const { state, dispatch } = useProject();
  const [configOpen, setConfigOpen] = useState(false);
  const collapsed = state.sidebarCollapsed;

  return (
    <>
      <aside className={cn(
        'flex flex-col bg-bg-secondary border-r border-border h-screen transition-all duration-200 flex-shrink-0',
        collapsed ? 'w-14' : 'w-56'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-border">
          {!collapsed && (
            <h1 className="text-sm font-semibold text-text-primary truncate">
              📊 Workload Dashboard
            </h1>
          )}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="p-1 rounded hover:bg-white/60 text-text-secondary transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {state.projects.length > 0 && navItems.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              onClick={() => dispatch({ type: 'SET_VIEW', payload: view })}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150',
                state.activeView === view
                  ? 'bg-white text-text-primary font-medium shadow-sm'
                  : 'text-text-secondary hover:bg-white/50 hover:text-text-primary'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-border">
          <button
            onClick={() => setConfigOpen(true)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-text-secondary hover:bg-white/50 hover:text-text-primary transition-all"
            title={collapsed ? 'Configuración' : undefined}
          >
            <Settings size={18} className="flex-shrink-0" />
            {!collapsed && <span>Configuración</span>}
          </button>
        </div>
      </aside>
      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}
    </>
  );
}
