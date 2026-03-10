import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { X, ChevronLeft, ChevronRight, ChevronDown, Users, Building2, Tag, Clock, Inbox } from 'lucide-react';
import type { DayDetails, DayHierarchyNode, DayProject } from '../../hooks/useDaySelection';

// ── Constantes visuales ──
const PANEL_WIDTH = 380;
const INDENT_PX = 14;

const PRIORITY_CONFIG = {
  high:   { color: '#ef4444', label: 'Alta' },
  medium: { color: '#f59e0b', label: 'Media' },
  low:    { color: '#22c55e', label: 'Baja' },
} as const;

// ── Props ──
interface DayDetailSidebarProps {
  dayDetails: DayDetails;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  width?: number;
}

export function DayDetailSidebar({
  dayDetails,
  onClose,
  onNavigate,
  canNavigatePrev,
  canNavigateNext,
  width,
}: DayDetailSidebarProps) {
  const { date, projects } = dayDetails;
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    new Set(),
  );
  

  return (
    <>
      {/* ── Overlay ── */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'transparent',
          zIndex: 40,
        }}
      />

      {/* ── Panel ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: width ?? PANEL_WIDTH,
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: 'none',
          zIndex: 41,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e2e8f0',
          borderRadius: '0 16px 16px 0',
          overflow: 'hidden',
          animation: 'slideInRight 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: '18px 18px 16px',
            borderBottom: '1px solid #f1f5f9',
            flexShrink: 0,
            backgroundColor: '#f9fafb',
          }}
        >
          {/* Título + Cerrar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#94a3b8',
                  margin: '0 0 4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Detalle del día
              </p>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#1e293b',
                  margin: 0,
                }}
              >
                {format(date, "d 'de' MMMM, yyyy", { locale: es })}
              </h3>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                color: '#64748b',
                display: 'flex',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Navegación */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <NavButton
              onClick={() => onNavigate('prev')}
              disabled={!canNavigatePrev}
            >
              <ChevronLeft size={16} />
            </NavButton>

            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#475569',
                minWidth: 120,
                textAlign: 'center',
              }}
            >
              {format(date, 'EEEE', { locale: es })}
            </span>

            <NavButton
              onClick={() => onNavigate('next')}
              disabled={!canNavigateNext}
            >
              <ChevronRight size={16} />
            </NavButton>
          </div>

          {/* Contador */}
          <p
            style={{
              fontSize: 12,
              color: '#64748b',
              margin: '12px 0 0',
              textAlign: 'center',
            }}
          >
            {projects.length === 0
              ? 'No hay proyectos activos'
              : `${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* ── Lista ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            backgroundColor: '#f9fafb',
          }}
        >
          {projects.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayDetails.hierarchy.map((node) => (
                <HierarchyRow
                  key={node.id}
                  node={node}
                  collapsedGroups={collapsedGroups}
                  onToggle={(id) => {
                    setCollapsedGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-componentes ──

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: '1px solid #e2e8f0',
        borderRadius: 6,
        padding: '6px 10px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        color: '#475569',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}

function ProjectCard({ project }: { project: DayProject }) {
  const priority = PRIORITY_CONFIG[project.priority];

  return (
    <div
      style={{
        padding: '12px 12px',
        marginBottom: 6,
        borderRadius: 8,
        backgroundColor: '#ffffff',
      }}
    >
      {/* Nombre */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#1e293b',
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {project.name}
      </div>

      {/* Metadata */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 10px',
          fontSize: 11,
          color: '#64748b',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Users size={12} />
          {project.assignee}
        </span>
        {project.branch && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} />
            {project.branch}
          </span>
        )}
        {project.type && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Tag size={12} />
            {project.type}
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: priority.color,
              display: 'inline-block',
            }}
          />
          {priority.label}
        </span>
      </div>

      {/* Fechas */}
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Clock size={12} />
        {format(project.startDate, 'dd/MM/yyyy')} →{' '}
        {format(project.endDate, 'dd/MM/yyyy')}
      </div>
    </div>
  );
}

function HierarchyRow({
  node,
  collapsedGroups,
  onToggle,
}: {
  node: DayHierarchyNode;
  collapsedGroups: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isGroup = node.children.length > 0;
  const isCollapsed = isGroup && collapsedGroups.has(node.id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          paddingLeft: INDENT_PX * node.level,
        }}
      >
        {isGroup ? (
          <GroupRow
            title={node.name}
            collapsed={isCollapsed}
            onToggle={() => onToggle(node.id)}
          />
        ) : node.project ? (
          <ProjectCard project={node.project} />
        ) : null}
      </div>
      {!isCollapsed &&
        node.children.map((child) => (
          <HierarchyRow
            key={child.id}
            node={child}
            collapsedGroups={collapsedGroups}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

function GroupRow({
  title,
  collapsed,
  onToggle,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 8,
        backgroundColor: '#ffffff',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#64748b',
        }}
        aria-label={collapsed ? 'Expandir grupo' : 'Contraer grupo'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#334155',
          lineHeight: 1.2,
        }}
      >
        {title}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
        <Inbox size={36} />
      </div>
      <div style={{ fontSize: 14 }}>Sin proyectos activos en esta fecha</div>
    </div>
  );
}

