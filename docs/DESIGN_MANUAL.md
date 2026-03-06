# Manual de Diseño - Dashboard de Carga de Trabajo

## 🎯 Visión General

**Propósito:** Dashboard empresarial para visualizar y gestionar carga de trabajo across múltiples vistas (gráfico de líneas, cuadrícula, timeline Gantt, tabla de proyectos).

**Stack Tecnológico:**
- React + TypeScript + Vite
- Recharts para visualizaciones
- Lucide React para iconos
- CSS inline (no Tailwind, no styled-components)
- Estado global via Context API

---

## 🏗️ Arquitectura de Componentes

### Estructura Actual
```
src/components/dashboard/
├── WorkloadLineChart.tsx    # Gráfico de líneas principal
├── WorkloadGrid.tsx         # Vista de cuadrícula de carga
├── GanttTimeline.tsx        # Timeline/Gantt chart
├── ProjectTable.tsx         # Tabla de proyectos con CRUD
└── (No hay layout global - cada vista es autocontenida)
```

### Principios de Componentes
- **Autocontenidos:** Cada vista maneja su propio estado y UI
- **CSS Inline:** Estilos definidos como objetos JavaScript dentro de componentes
- **Tokens Locales:** Cada componente define sus propios COLORS, RADIUS, FONT_STACK
- **Sin Layout Global:** No existe componente Layout o Sidebar principal

---

## 🎨 Sistema de Diseño Actual

### Colores (WorkloadLineChart.tsx - Referencia)
```typescript
const COLORS = {
  bg: '#FFFFFF',              // Fondo principal de cards
  bgSubtle: '#F9FAFB',        // Fondo sutil
  bgMuted: '#F3F4F6',         // Hover states
  border: 'rgba(0,0,0,0.06)', // Bordes principales
  borderLight: 'rgba(0,0,0,0.04)', // Bordes sutiles
  text: '#111827',            // Texto principal
  textSecondary: '#6B7280',   // Texto secundario
  textTertiary: '#9CA3AF',    // Texto terciario
  accent: '#3B82F6',          // Azul principal
  accentHover: '#2563EB',     // Azul hover
  accentSoft: '#EFF6FF',      // Fondo azul sutil
  accentBorder: '#BFDBFE',    // Bordes azules
};
```

### Tipografía
```typescript
const FONT_STACK = 
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
```

### Espaciado y Bordes
```typescript
const RADIUS = {
  sm: 8,    // Botones, inputs
  md: 12,   // Cards, dropdowns
  lg: 16,   // Elementos grandes
  xl: 20,   // Elementos prominentes
  full: 9999, // Avatares, pills
};
```

---

## 📱 Patrones de UI Actuales

### 1. Botones (PillButton)
```typescript
function PillButton({ active, children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 14px',
        fontSize: 13,
        fontWeight: 500,
        borderRadius: RADIUS.sm,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.18s ease',
        background: active ? COLORS.accent : 'transparent',
        color: active ? '#fff' : COLORS.textSecondary,
        // ... hover states
      }}
    >
      {children}
    </button>
  );
}
```

### 2. Icon Buttons (IconButton)
```typescript
function IconButton({ children, onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 36,
        height: 36,
        borderRadius: RADIUS.sm,
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // ... hover states
      }}
    >
      {children}
    </button>
  );
}
```

### 3. Cards/Paneles
```typescript
const cardStyle = {
  background: COLORS.bg,
  borderRadius: RADIUS.xl,
  border: `1px solid ${COLORS.border}`,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  padding: 24,
};
```

---

## 🔄 Estados e Interacciones

### Hover States (React Pattern)
```typescript
// ❌ Esto NO funciona en React inline styles
const hoverStyle = {
  ':hover': {
    background: COLORS.bgMuted,
  },
};

// ✅ Patrón correcto con useState
const [hovered, setHovered] = useState(false);

const buttonStyle = {
  background: hovered ? COLORS.bgMuted : 'transparent',
  transition: 'all 150ms ease',
};

return (
  <button
    style={buttonStyle}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
  >
    Button
  </button>
);
```

### Focus States (React Pattern)
```typescript
// ❌ Esto NO funciona en React inline styles
const focusStyle = {
  ':focus': {
    boxShadow: SHADOWS.focus,
  },
};

// ✅ Patrón correcto con useState
const [focused, setFocused] = useState(false);

const inputStyle = {
  outline: 'none',
  boxShadow: focused ? SHADOWS.focus : 'none',
  transition: 'box-shadow 150ms ease',
};

return (
  <input
    style={inputStyle}
    onFocus={() => setFocused(true)}
    onBlur={() => setFocused(false)}
  />
);
```

### Disabled States
```typescript
const disabledStyle = {
  opacity: 0.4,
  cursor: 'not-allowed',
  pointerEvents: 'none',
};
```

---

## 📊 Componentes de Visualización

### Recharts Configuration
```typescript
// Estilos consistentes para todos los gráficos
const chartStyles = {
  cartesianGrid: {
    stroke: COLORS.borderLight,
    strokeDasharray: 'none',
  },
  xAxis: {
    tick: { fontSize: 11, fill: COLORS.textTertiary },
    axisLine: { stroke: COLORS.border },
    tickLine: false,
  },
  yAxis: {
    tick: { fontSize: 11, fill: COLORS.textTertiary },
    axisLine: false,
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      background: COLORS.bg,
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.md,
    },
  },
};
```

---

## 🗂️ Vistas del Dashboard

### 1. WorkloadLineChart (Gráfico de Líneas)
**Propósito:** Visualización temporal de carga de trabajo por persona
**Componentes clave:**
- Toolbar con ScaleControls (Auto/200%/300%)
- QuickNav (Hoy/2S/1M/3M)
- Gráfico principal con líneas por persona
- ReferenceLine para "HOY"
- Brush para zoom de rango
- Panel lateral de detalles (opcional)

### 2. WorkloadGrid (Cuadrícula)
**Propósito:** Vista matricial de carga por persona/día
**Componentes clave:**
- DateRangePicker
- GroupByToggle (Persona/Rama/Tipo)
- Grid de celdas coloreadas por carga
- Headers sticky

### 3. GanttTimeline (Timeline)
**Propósito:** Vista temporal de proyectos con barras
**Componentes clave:**
- TimeAxis con navegación
- ProjectBars con drag & drop
- ZoomControls
- Today indicator

### 4. ProjectTable (Tabla)
**Propósito:** CRUD completo de proyectos
**Componentes clave:**
- SearchInput
- FilterDropdown
- SortControls
- Inline editing
- Row actions menu

---

## 🎯 Patrones de Datos

### Estructura de Proyecto
```typescript
interface Project {
  id: string;
  name: string;
  assignees: string[];
  branch?: string | string[];
  type?: string;
  priority: 1 | 2 | 3; // low | medium | high
  startDate?: string;
  endDate?: string;
  status?: string;
  // Campos dinámicos permitidos
  [key: string]: unknown;
}
```

### Context API
```typescript
// ProjectContext.tsx - Estado global
interface ProjectContextType {
  state: {
    projects: Project[];
    filters: {
      persons: string[];
      branches: string[];
      types: string[];
      // ... otros filtros
    };
  };
  actions: {
    updateProject: (project: Project) => void;
    deleteProject: (id: string) => void;
    // ... otras acciones
  };
}
```

---

## 🚀 Directrices de Modernización

### Objetivo: Apple/shadcn/ui 2025-2026

#### 1. Sistema de Colores Evolucionado
```typescript
const COLORS_EVOLVED = {
  // Superficies con más profundidad
  bg: '#FFFFFF',
  bgCanvas: '#FAFAFA',        // Nuevo: fondo general
  bgSubtle: '#F5F5F5',
  bgMuted: '#F0F0F0',
  bgInset: '#EBEBEB',         // Nuevo: inputs/áreas hundidas
  
  // Bordes de 3 niveles
  border: 'rgba(0, 0, 0, 0.08)',
  borderSubtle: 'rgba(0, 0, 0, 0.05)',
  borderFocus: 'rgba(59, 130, 246, 0.5)',
  
  // Texto con más contraste
  text: '#0A0A0A',            // Más negro
  textSecondary: '#525252',   // Más cálido
  textTertiary: '#A3A3A3',
  textDisabled: '#D4D4D4',
  
  // Acentos más saturados
  accent: '#2563EB',
  accentHover: '#1D4ED8',
  accentPressed: '#1E40AF',
};
```

#### 2. Tipografía Mejorada
```typescript
const TYPOGRAPHY = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  
  heading: {
    fontSize: '20px',
    fontWeight: 600,           // Semibold, no bold
    lineHeight: 1.3,
    letterSpacing: '-0.02em',
  },
  
  label: {
    fontSize: '13px',
    fontWeight: 500,           // Medium para UI labels
    lineHeight: 1.4,
  },
  
  data: {
    fontSize: '13px',
    fontWeight: 400,
    fontVariantNumeric: 'tabular-nums', // Alineación de números
  },
};
```

#### 3. Componentes Modernizados

##### PillGroup (Segmented Control)
```typescript
const PillGroup = ({ options, value, onChange }) => (
  <div style={{
    display: 'inline-flex',
    gap: '2px',
    padding: '3px',
    background: COLORS.bgMuted,
    borderRadius: RADIUS.sm,
  }}>
    {options.map(option => (
      <button
        key={option.value}
        onClick={() => onChange(option.value)}
        style={{
          background: value === option.value ? COLORS.bg : 'transparent',
          boxShadow: value === option.value ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          // ... estilos Apple
        }}
      >
        {option.label}
      </button>
    ))}
  </div>
);
```

##### Toggle Switch
```typescript
const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    style={{
      width: 44,
      height: 24,
      borderRadius: '9999px',
      background: checked ? COLORS.accent : COLORS.bgInset,
      transition: 'background 150ms ease',
      position: 'relative',
    }}
  >
    <div style={{
      width: 20,
      height: 20,
      borderRadius: '9999px',
      background: '#FFFFFF',
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      transform: `translateX(${checked ? 20 : 0}px)`,
      transition: 'transform 150ms ease',
    }} />
  </button>
);
```

---

## 📱 Mobile-First Strategy

### Breakpoints
```typescript
const BREAKPOINTS = {
  mobile: '(max-width: 767px)',    // Mobile-first usa max-width
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
  wide:    '(min-width: 1440px)',
};
```

### Estrategia de Adaptación
- **Desktop-first con responsive adaptations:** El dashboard está optimizado para desktop con adaptaciones mobile
- **Gantt chart adaptativo:** Simplificado en mobile, completo en desktop
- **Grid scrollable:** Horizontal scroll en mobile, grid completo en desktop
- **Cards fallback:** Tabla se convierte en cards apilados en mobile

---

## 🔧 Implementación Gradual

### Fase 1: Fundamentos
1. Crear `src/lib/designTokens.ts`
2. Instalar Inter font
3. Actualizar WorkloadLineChart como piloto

### Fase 2: Componentes Base
1. Modernizar PillButton, IconButton
2. Implementar Toggle, PillGroup
3. Crear SearchInput mejorado

### Fase 3: Vistas
1. GanttTimeline (prioridad)
2. WorkloadGrid
3. ProjectTable
4. WorkloadLineChart (refinamiento)

### Fase 4: Mobile
1. Bottom navigation
2. Responsive adaptations
3. Touch optimizations

---

## 🎯 Referencias de Diseño

### Inspiración Visual
- **Apple Human Interface Guidelines** - Principios de claridad y profundidad
- **shadcn/ui** - Componentes modernos y accesibles
- **Linear.app** - Interacciones sutiles y micro-animaciones
- **Vercel Dashboard** - Density y organización
- **TaxPal** - Estilo clean y moderno

### Best Practices
- **Reducción consciente:** Cada elemento visual debe tener propósito
- **Densidad con calma:** Mucha información pero organizada
- **Interacciones que respiran:** Transiciones suaves 150-200ms
- **Accesibilidad primero:** Focus states, contrastes WCAG AA

---

## 🚨 Reglas de Oro

1. **No romper funcionalidad existente**
2. **Mantener CSS inline** (no migrar a Tailwind)
3. **Evolucionar, no reemplazar**
4. **Desktop-first con responsive adaptations**
5. **Performance sobre efectos**
6. **Accesibilidad no negociable**

---

## 🔧 Convenciones de Componentes

### Exportación y Reutilización
```typescript
// Componentes reutilizables entre vistas (exportados)
export const Button: React.FC<ButtonProps> = ({ ... }) => { ... };
export const IconButton: React.FC<IconButtonProps> = ({ ... }) => { ... };
export const Badge: React.FC<BadgeProps> = ({ ... }) => { ... };

// Componentes privados de cada vista (no exportados)
const PillButton = ({ ... }) => { ... }; // Solo dentro de WorkloadLineChart
const ProjectBar = ({ ... }) => { ... }; // Solo dentro de GanttTimeline
```

### Transición de Tokens Locales → Globales
```typescript
// ESTADO ACTUAL (en cada componente)
const COLORS = {
  bg: '#FFFFFF',
  text: '#111827',
  // ...
};

// OBJETIVO (importar desde designTokens.ts)
import { COLORS } from '@/lib/designTokens';
```

---

## 📝 Checklist de Modernización

### Para cada componente:
- [ ] Importar designTokens
- [ ] Actualizar colores con sistema evolucionado
- [ ] Aplicar tipografía mejorada
- [ ] Implementar hover states sutiles
- [ ] Añadir focus states para accesibilidad
- [ ] Optimizar para mobile
- [ ] Mantener funcionalidad existente

### Para cada vista:
- [ ] Modernizar toolbar/controls
- [ ] Actualizar visualizaciones
- [ ] Mejorar layout y spacing
- [ ] Implementar responsive design
- [ ] Testing cross-browser

---

## 🔗 Recursos Externos

### Dependencias a Instalar
```bash
npm install @fontsource/inter
# O usar Google Fonts si se prefiere
```

### Fuentes Alternativas
- Google Fonts: Inter (https://fonts.google.com/specimen/Inter)
- System fonts: Mantener Apple system fonts como fallback

### Iconos
- Lucide React (ya instalado)
- strokeWidth: 1.5 por defecto, 2 para activos

---

*Este manual es un documento vivo. Actualizarlo conforme evolucione el diseño y se añadan nuevos patrones.*
