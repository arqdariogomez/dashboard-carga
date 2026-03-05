import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

// ============================================================================
// TYPES
// ============================================================================

export type TimePreset = '2W' | '1M' | '3M' | '6M' | 'ALL';

export interface ZoomConfig {
  /** Días visibles (null = todo el rango) */
  days: number | null;
  /** Label a mostrar */
  label: string;
}

export interface ZoomControlsProps {
  /** Escala de zoom actual (0.3-3, compatible con WorkloadLineChart) */
  zoom: number;
  /** Preset activo */
  activePreset: TimePreset | null;
  /** Callback al cambiar zoom */
  onZoomChange: (zoom: number, preset: TimePreset | null) => void;
  /** Variante de visualización */
  variant?: 'full' | 'presets-only';
  /** Rango de fechas visible (opcional, para display) */
  visibleRange?: { start: Date; end: Date } | null;
  /** Deshabilitar controles */
  disabled?: boolean;
  /** Presets personalizados (opcional) */
  customPresets?: Partial<Record<TimePreset, ZoomConfig>>;
}

// ============================================================================
// CONSTANTS (compatibles con nuestro proyecto)
// ============================================================================

const DEFAULT_PRESETS: Record<TimePreset, ZoomConfig> = {
  '2W': { days: 14, label: '2S' },
  '1M': { days: 30, label: '1M' },
  '3M': { days: 90, label: '3M' },
  '6M': { days: 180, label: '6M' },
  ALL: { days: null, label: 'Todo' },
};

// Compatible con WorkloadLineChart
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_WHEEL_FACTOR = 1.15;

// ============================================================================
// HELPERS (compatibles con WorkloadLineChart)
// ============================================================================

/**
 * Convierte días a escala de zoom (0.3-3) usando escala logarítmica
 * Compatible con la lógica de WorkloadLineChart
 */
function daysToZoom(days: number | null): number {
  if (days === null) return 1; // ALL preset = zoom 1
  
  const logMin = Math.log(MIN_ZOOM);
  const logMax = Math.log(MAX_ZOOM);
  
  // Mapear días a escala logarítmica invertida
  // Más días = menos zoom (zoom más pequeño)
  const minDays = 14; // 2W
  const maxDays = 365; // ~1 año
  
  const clampedDays = Math.max(minDays, Math.min(maxDays, days));
  const logRange = Math.log(maxDays) - Math.log(minDays);
  const logValue = Math.log(maxDays) - Math.log(clampedDays);
  
  const t = logValue / logRange; // 0 a 1
  return Math.exp(logMin + t * (logMax - logMin));
}

/**
 * Convierte escala de zoom a días usando escala logarítmica
 */
function zoomToDays(zoom: number): number {
  const logMin = Math.log(MIN_ZOOM);
  const logMax = Math.log(MAX_ZOOM);
  
  const t = (Math.log(zoom) - logMin) / (logMax - logMin); // 0 a 1
  
  const minDays = 14;
  const maxDays = 365;
  const logRange = Math.log(maxDays) - Math.log(minDays);
  
  return Math.round(Math.exp(Math.log(maxDays) - t * logRange));
}

// ============================================================================
// ZoomSlider Component (compatible con WorkloadLineChart)
// ============================================================================

interface ZoomSliderProps {
  zoom: number;
  onChange: (z: number) => void;
}

function ZoomSlider({ zoom, onChange }: ZoomSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const listenersRef = useRef<{
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null>(null);

  const sliderValue = useMemo(() => {
    const logMin = Math.log(MIN_ZOOM);
    const logMax = Math.log(MAX_ZOOM);
    return (Math.log(zoom) - logMin) / (logMax - logMin);
  }, [zoom]);

  const applyFromMouse = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const logMin = Math.log(MIN_ZOOM);
      const logMax = Math.log(MAX_ZOOM);
      const newZoom = Math.exp(logMin + t * (logMax - logMin));
      onChange(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
    },
    [onChange],
  );

  useEffect(() => {
    return () => {
      if (listenersRef.current) {
        document.removeEventListener('mousemove', listenersRef.current.move);
        document.removeEventListener('mouseup', listenersRef.current.up);
      }
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      applyFromMouse(e.clientX);

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        requestAnimationFrame(() => {
          applyFromMouse(ev.clientX);
        });
      };
      const onUp = () => {
        dragging.current = false;
        if (listenersRef.current) {
          document.removeEventListener('mousemove', listenersRef.current.move);
          document.removeEventListener('mouseup', listenersRef.current.up);
        }
        listenersRef.current = null;
      };

      listenersRef.current = { move: onMove, up: onUp };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [applyFromMouse],
  );

  const fitAllPos = useMemo(() => {
    const logMin = Math.log(MIN_ZOOM);
    const logMax = Math.log(MAX_ZOOM);
    return ((Math.log(1) - logMin) / (logMax - logMin)) * 100;
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(MIN_ZOOM, zoom / ZOOM_WHEEL_FACTOR))}
        className="h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-gray-50 flex-shrink-0 transition-colors"
        title="Alejar"
      >
        <span className="text-xs font-medium">−</span>
      </button>

      <div
        ref={trackRef}
        className="relative h-2 bg-gray-200 rounded-full cursor-pointer w-24"
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute top-[-3px] w-0.5 h-[12px] bg-gray-400/50 rounded-full"
          style={{ left: `${fitAllPos}%` }}
          title="Ajustar todo"
        />
        <div
          className="absolute top-[-2px] w-1 h-2 bg-blue-500 rounded-full shadow-sm transform -translate-x-1/2"
          style={{ left: `${sliderValue * 100}%` }}
        />
      </div>

      <button
        onClick={() => onChange(Math.min(MAX_ZOOM, zoom * ZOOM_WHEEL_FACTOR))}
        className="h-7 w-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-gray-50 flex-shrink-0 transition-colors"
        title="Acercar"
      >
        <span className="text-xs font-medium">+</span>
      </button>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ZoomControls({
  zoom,
  activePreset,
  onZoomChange,
  variant = 'full',
  visibleRange,
  disabled = false,
  customPresets,
}: ZoomControlsProps) {
  
  const presets = useMemo(() => ({
    ...DEFAULT_PRESETS,
    ...customPresets,
  }), [customPresets]);

  const presetKeys = useMemo(() => 
    (Object.keys(presets) as TimePreset[]).filter(key => presets[key]),
    [presets]
  );

  // Handlers
  const handlePresetClick = useCallback((preset: TimePreset) => {
    if (disabled) return;
    const config = presets[preset];
    if (!config) return;
    
    const newZoom = daysToZoom(config.days);
    onZoomChange(newZoom, preset);
  }, [disabled, presets, onZoomChange]);

  const handleSliderChange = useCallback((newZoom: number) => {
    if (disabled) return;
    onZoomChange(newZoom, null); // Clear preset when using slider
  }, [disabled, onZoomChange]);

  // Current days for tooltip
  const currentDays = useMemo(() => zoomToDays(zoom), [zoom]);

  return (
    <div className="flex items-center gap-2">
      {/* Presets */}
      <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 p-0.5">
        {presetKeys.map((preset) => {
          const config = presets[preset];
          const isActive = activePreset === preset;
          
          return (
            <button
              key={preset}
              onClick={() => handlePresetClick(preset)}
              disabled={disabled}
              className={`
                px-2.5 py-1 text-[11px] font-medium rounded-md transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                ${isActive
                  ? 'bg-white text-text-primary shadow-sm border border-gray-200'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/50'
                }
              `}
              title={config.days ? `${config.days} días` : 'Todo el rango'}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Slider (solo en variant='full') */}
      {variant === 'full' && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
          <ZoomSlider zoom={zoom} onChange={handleSliderChange} />
        </div>
      )}

      {/* Date range display */}
      {visibleRange && (
        <div className="text-[11px] text-text-secondary tabular-nums hidden sm:block">
          {format(visibleRange.start, 'dd MMM', { locale: es })}
          {' — '}
          {format(visibleRange.end, 'dd MMM yyyy', { locale: es })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { daysToZoom, zoomToDays };
