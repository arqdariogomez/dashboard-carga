/**
 * Design Tokens - Sistema de Diseño Evolucionado
 * Apple/shadcn/ui 2025-2026
 */

// ────────────────────────────────────────────
// Colores
// ────────────────────────────────────────────

export const COLORS = {
  // === Superficies ===
  bg: '#FFFFFF',              // Superficie principal (cards, modales)
  bgCanvas: '#FAFAFA',        // Canvas/fondo general
  bgSubtle: '#F5F5F5',        // Elementos elevados sobre canvas
  bgMuted: '#F0F0F0',         // Hover states, wells internos
  bgInset: '#EBEBEB',         // Inputs, áreas hundidas

  // === Bordes ===
  border: 'rgba(0, 0, 0, 0.08)',     // Bordes estructurales
  borderSubtle: 'rgba(0, 0, 0, 0.05)', // Separadores internos
  borderFocus: 'rgba(59, 130, 246, 0.5)', // Focus rings

  // === Texto ===
  text: '#0A0A0A',            // Títulos, datos principales (más negro)
  textSecondary: '#525252',   // Labels, texto de apoyo (más cálido)
  textTertiary: '#A3A3A3',    // Placeholders, metadata
  textDisabled: '#D4D4D4',    // Estados deshabilitados

  // === Acento primario (Azul) ===
  accent: '#2563EB',          // Primario (ligeramente más saturado)
  accentHover: '#1D4ED8',     // Hover del primario
  accentPressed: '#1E40AF',   // Active/pressed
  accentSoft: '#EFF6FF',      // Background sutil (badges, pills)
  accentSofter: '#F0F7FF',    // Background más sutil (hover de filas)
  accentBorder: '#93C5FD',    // Bordes de elementos accent
  accentText: '#1E40AF',      // Texto sobre fondos accent soft

  // === Semánticos ===
  success: '#16A34A',
  successSoft: '#F0FDF4',
  warning: '#D97706',
  warningSoft: '#FFFBEB',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',

  // === Overlay ===
  overlay: 'rgba(0, 0, 0, 0.4)',
  overlayLight: 'rgba(0, 0, 0, 0.02)',  // Hover sutil sobre blanco
};

// ────────────────────────────────────────────
// Tipografía
// ────────────────────────────────────────────

export const TYPOGRAPHY = {
  // Font family
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",

  // === Escala tipográfica ===
  heading: {
    fontSize: '20px',          // No más de 24px en dashboards
    fontWeight: 600,           // Semibold, no bold
    lineHeight: 1.3,
    letterSpacing: '-0.02em',  // Tracking negativo sutil
    color: COLORS.text,
  },

  subheading: {
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '-0.01em',
    color: COLORS.text,
  },

  body: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '0',
    color: COLORS.textSecondary,
  },

  label: {
    fontSize: '13px',
    fontWeight: 500,           // Medium — clave para UI labels
    lineHeight: 1.4,
    letterSpacing: '0',
    color: COLORS.textSecondary,
  },

  caption: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: '0.01em',   // Ligero tracking positivo para legibilidad
    color: COLORS.textTertiary,
  },

  metric: {
    fontSize: '28px',
    fontWeight: 600,
    lineHeight: 1.1,
    letterSpacing: '-0.03em',
    color: COLORS.text,
    fontVariantNumeric: 'tabular-nums',  // Números tabulares para alineación
  },

  data: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: '0',
    color: COLORS.text,
    fontVariantNumeric: 'tabular-nums',
  },
};

// ────────────────────────────────────────────
// Espaciado y Dimensiones
// ────────────────────────────────────────────

export const SPACING = {
  // === Sistema de espaciado base-4 ===
  '0':   '0px',
  '1':   '4px',
  '2':   '8px',
  '3':   '12px',
  '4':   '16px',
  '5':   '20px',
  '6':   '24px',
  '8':   '32px',
  '10':  '40px',
  '12':  '48px',
  '16':  '64px',

  // === Espaciados semánticos ===
  pagePadding:     '24px',       // Padding del área de contenido principal
  pagePaddingMobile: '16px',
  
  cardPadding:     '20px',       // Padding interno de cards
  cardPaddingCompact: '16px',    // Cards en modo compacto
  
  cardGap:         '16px',       // Gap entre cards
  sectionGap:      '24px',       // Gap entre secciones
  
  inlineGap:       '8px',        // Gap entre elementos inline (icono + texto)
  inlineGapTight:  '6px',        // Gap tight (badges, pills)
  
  stackGap:        '12px',       // Gap en stacks verticales
  stackGapLoose:   '16px',       // Stack vertical con más aire
};

export const DIMENSIONS = {
  // === Radios ===
  radius: {
    xs:   '6px',      // Badges, pills pequeños
    sm:   '8px',      // Botones, inputs, chips
    md:   '12px',     // Cards, dropdowns, popovers
    lg:   '16px',     // Modales, panels grandes
    xl:   '20px',     // Cards hero, elementos prominentes
    full: '9999px',   // Avatares, toggles, pills
  },

  // === Sidebar ===
  sidebarWidth:          '240px',    // Sidebar expandida
  sidebarWidthCollapsed: '64px',     // Sidebar colapsada
  
  // === Header ===
  headerHeight:    '56px',     // Más compacto que el estándar de 64px
  
  // === Elementos interactivos ===
  buttonHeight:    '36px',     // Botones estándar
  buttonHeightSm:  '32px',    // Botones small
  buttonHeightLg:  '40px',    // Botones large
  
  iconButtonSize:  '36px',    // Icon buttons cuadrados
  iconButtonSizeSm:'32px',
  
  inputHeight:     '36px',    // Inputs estándar
  
  toggleWidth:     '44px',    // Toggle switches
  toggleHeight:    '24px',
  toggleThumb:     '20px',
};

// ────────────────────────────────────────────
// Sombras y Elevación
// ────────────────────────────────────────────

export const SHADOWS = {
  // === Sistema de elevación de 4 niveles ===
  none: 'none',
  
  // Nivel 1: Elevación mínima (cards sobre canvas)
  sm: '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
  
  // Nivel 2: Elevación media (dropdowns, popovers)
  md: '0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
  
  // Nivel 3: Elevación alta (modales, sheets)
  lg: '0 8px 30px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
  
  // Nivel 4: Elevación máxima (toasts flotantes)
  xl: '0 16px 50px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(0, 0, 0, 0.05)',
  
  // === Sombras especiales ===
  focus: '0 0 0 2px #FFFFFF, 0 0 0 4px rgba(37, 99, 235, 0.5)',
  inset: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
  sidebar: '4px 0 24px rgba(0, 0, 0, 0.08)',
};

// ────────────────────────────────────────────
// Transiciones
// ────────────────────────────────────────────

export const TRANSITIONS = {
  // === Durations ===
  fast:    '100ms',    // Hover states, color changes
  normal:  '150ms',    // Transformaciones, apariciones
  smooth:  '200ms',    // Expansiones, slides
  slow:    '300ms',    // Modales, overlays

  // === Easings ===
  ease:      'cubic-bezier(0.4, 0, 0.2, 1)',    // Default
  easeIn:    'cubic-bezier(0.4, 0, 1, 1)',       // Salida de pantalla
  easeOut:   'cubic-bezier(0, 0, 0.2, 1)',       // Entrada a pantalla
  spring:    'cubic-bezier(0.34, 1.56, 0.64, 1)', // Efecto bounce sutil

  // === Combinaciones comunes ===
  hover:     '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  transform: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  overlay:   '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  collapse:  '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  
  // === Evitar 'all' - especificar propiedades ===
  colors:    '150ms cubic-bezier(0.4, 0, 0.2, 1)',    // Solo color changes
  opacity:   '150ms cubic-bezier(0.4, 0, 0.2, 1)',    // Solo opacity
  boxShadow: '150ms cubic-bezier(0.4, 0, 0.2, 1)',    // Solo box-shadow
};

// ────────────────────────────────────────────
// Breakpoints (Media Queries)
// ────────────────────────────────────────────

export const BREAKPOINTS = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
  wide:    '(min-width: 1440px)',
};

// ────────────────────────────────────────────
// Utilidades
// ────────────────────────────────────────────

export const UTILS = {
  // Helper para crear estilos con transición
  withTransition: (styles: React.CSSProperties, duration: keyof typeof TRANSITIONS = 'normal') => ({
    ...styles,
    transition: `all ${TRANSITIONS[duration]}`,
  }),

  // Helper para estilos hover
  hover: (baseStyles: React.CSSProperties, hoverStyles: React.CSSProperties) => ({
    ...baseStyles,
    ':hover': hoverStyles,
  }),

  // Helper para focus states
  focus: (baseStyles: React.CSSProperties) => ({
    ...baseStyles,
    outline: 'none',
    ':focus': {
      boxShadow: SHADOWS.focus,
    },
  }),
};

// ────────────────────────────────────────────
// Legacy compatibility (para migración gradual)
// ────────────────────────────────────────────

// Mantener compatibilidad con código existente
export const LEGACY_COLORS = {
  bg: COLORS.bg,
  bgSubtle: COLORS.bgSubtle,
  bgMuted: COLORS.bgMuted,
  border: COLORS.border,
  borderLight: COLORS.borderSubtle,
  text: COLORS.text,
  textSecondary: COLORS.textSecondary,
  textTertiary: COLORS.textTertiary,
  accent: COLORS.accent,
  accentHover: COLORS.accentHover,
  accentSoft: COLORS.accentSoft,
  accentBorder: COLORS.accentBorder,
};

export const LEGACY_RADIUS = {
  sm: DIMENSIONS.radius.sm,
  md: DIMENSIONS.radius.md,
  lg: DIMENSIONS.radius.lg,
  xl: DIMENSIONS.radius.xl,
  full: DIMENSIONS.radius.full,
};

export const LEGACY_FONT_STACK = TYPOGRAPHY.fontFamily;
