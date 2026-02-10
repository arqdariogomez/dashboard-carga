import { useState, useCallback } from 'react';
import type { ProjectLoad } from '@/lib/types';

interface LoadBubbleProps {
  load: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  projects?: ProjectLoad[];
  dateLabel?: string;
  onClick?: () => void;
}

function getLoadColorEnhanced(load: number): { bg: string; text: string; border: string; gradient: string } {
  if (load === 0) return { bg: '#F3F3F3', text: '#9B9B9B', border: '#E0E0E0', gradient: 'linear-gradient(135deg, #F8F8F8, #ECECEC)' };
  if (load <= 0.5) return { bg: '#DBEDDB', text: '#2D6A2E', border: '#B8D8B8', gradient: 'linear-gradient(135deg, #E8F5E8, #C3E6CB)' };
  if (load <= 0.7) return { bg: '#D3E5EF', text: '#1A5276', border: '#A8CBE0', gradient: 'linear-gradient(135deg, #E0EFF7, #B8DAFF)' };
  if (load <= 0.9) return { bg: '#FFF3D1', text: '#7D6608', border: '#F0D88A', gradient: 'linear-gradient(135deg, #FFF8E1, #FFEEBA)' };
  if (load <= 1.0) return { bg: '#FADEC9', text: '#8B4513', border: '#E8C4A0', gradient: 'linear-gradient(135deg, #FDE8D5, #FFCBA4)' };
  return { bg: '#FFE2DD', text: '#B71C1C', border: '#F0A8A0', gradient: 'linear-gradient(135deg, #FFEBE8, #F5C6CB)' };
}

export function LoadBubble({ load, size = 'md', showLabel = true, projects, dateLabel, onClick }: LoadBubbleProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const color = getLoadColorEnhanced(load);
  const isCritical = load > 1.0;

  const sizeConfig = {
    sm: { min: 6, max: 36, font: 'text-[9px]', labelThreshold: 22 },
    md: { min: 12, max: 48, font: 'text-[11px]', labelThreshold: 28 },
    lg: { min: 20, max: 56, font: 'text-sm', labelThreshold: 28 },
  };

  const s = sizeConfig[size];
  const clampedLoad = Math.min(load, 2);
  const scaleFactor = Math.min(clampedLoad, 1.5) / 1.5;
  const diameter = s.min + (s.max - s.min) * scaleFactor;
  const percentage = Math.round(load * 100);
  const showText = showLabel && diameter >= s.labelThreshold;

  const handleMouseEnter = useCallback(() => setShowTooltip(true), []);
  const handleMouseLeave = useCallback(() => setShowTooltip(false), []);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={`rounded-full flex items-center justify-center transition-all duration-200 ${
          isCritical ? 'load-pulse' : ''
        } ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[#579DFF]/40' : 'cursor-default'}`}
        style={{
          width: `${diameter}px`,
          height: `${diameter}px`,
          background: color.gradient,
          border: `1.5px solid ${color.border}`,
          color: color.text,
          boxShadow: isCritical ? `0 0 8px ${color.bg}` : 'none',
        }}
        onClick={onClick}
      >
        {showText && (
          <span className={`${s.font} font-semibold tabular-nums leading-none`}>
            {percentage}%
          </span>
        )}
      </div>

      {/* Enhanced Tooltip */}
      {showTooltip && (projects && projects.length > 0 || load > 0) && (
        <div className="absolute z-[100] bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white border border-border rounded-lg shadow-xl p-3 min-w-[200px] max-w-[260px] pointer-events-none fade-in">
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-r border-b border-border rotate-45" />

          {dateLabel && (
            <div className="text-[10px] text-text-secondary mb-1.5">{dateLabel}</div>
          )}

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-primary">Carga total</span>
            <span
              className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {percentage}%
            </span>
          </div>

          {/* Load bar */}
          <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: color.text,
                opacity: 0.6,
              }}
            />
          </div>

          {projects && projects.length > 0 && (
            <div className="space-y-1">
              {projects.map((p) => (
                <div key={p.projectId} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-text-primary truncate flex-1">{p.projectName}</span>
                  <span className="tabular-nums font-medium text-text-secondary whitespace-nowrap">
                    {Math.round(p.dailyLoad * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {load === 0 && (
            <div className="text-[11px] text-text-secondary italic">Sin proyectos asignados</div>
          )}
        </div>
      )}
    </div>
  );
}
