import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Filter, Eye, ArrowUpDown, Palette, Layers, Plus, Save } from 'lucide-react';
import { COLORS, DIMENSIONS, SHADOWS, TRANSITIONS, TYPOGRAPHY } from '@/lib/designTokens';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface ToolbarDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  secondaryOptions?: DropdownOption[];
  secondaryValue?: string;
  onSecondaryChange?: (value: string) => void;
  placeholder?: string;
}

export function ToolbarDropdown({
  value,
  options,
  onChange,
  icon,
  secondaryOptions,
  secondaryValue,
  onSecondaryChange,
  placeholder = 'Seleccionar',
}: ToolbarDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '30px',
          borderRadius: DIMENSIONS.radius.sm,
          border: 'none',
          background: 'transparent',
          padding: '0 8px',
          fontSize: '12px',
          color: isOpen ? COLORS.accent : COLORS.textSecondary,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          transition: TRANSITIONS.hover,
          fontFamily: TYPOGRAPHY.fontFamily,
          fontWeight: 500,
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = COLORS.bgMuted;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {icon && (
          <span style={{ opacity: 0.7, display: 'flex' }}>
            {icon}
          </span>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>{displayLabel}</span>
        <ChevronDown
          size={12}
          style={{
            opacity: 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: TRANSITIONS.transform,
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            zIndex: 100,
            minWidth: '160px',
            borderRadius: DIMENSIONS.radius.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            boxShadow: SHADOWS.lg,
            padding: '4px',
            animation: `${TRANSITIONS.smooth} ease-out`,
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: DIMENSIONS.radius.sm,
                border: 'none',
                background: option.value === value ? COLORS.accentSoft : 'transparent',
                color: option.value === value ? COLORS.accentText : COLORS.textSecondary,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: TRANSITIONS.colors,
                fontFamily: TYPOGRAPHY.fontFamily,
              }}
              onMouseEnter={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = COLORS.bgMuted;
                  e.currentTarget.style.color = COLORS.text;
                }
              }}
              onMouseLeave={(e) => {
                if (option.value !== value) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = COLORS.textSecondary;
                }
              }}
            >
              {option.icon && (
                <span style={{ opacity: 0.7, display: 'flex', flexShrink: 0 }}>
                  {option.icon}
                </span>
              )}
              {option.label}
            </button>
          ))}

          {secondaryOptions && secondaryValue !== undefined && onSecondaryChange && (
            <>
              <div
                style={{
                  height: '1px',
                  background: COLORS.border,
                  margin: '4px 0',
                }}
              />
              {secondaryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onSecondaryChange(option.value);
                    setIsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: DIMENSIONS.radius.sm,
                    border: 'none',
                    background: option.value === secondaryValue ? COLORS.accentSoft : 'transparent',
                    color: option.value === secondaryValue ? COLORS.accentText : COLORS.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: TRANSITIONS.colors,
                    fontFamily: TYPOGRAPHY.fontFamily,
                  }}
                  onMouseEnter={(e) => {
                    if (option.value !== secondaryValue) {
                      e.currentTarget.style.background = COLORS.bgMuted;
                      e.currentTarget.style.color = COLORS.text;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (option.value !== secondaryValue) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = COLORS.textSecondary;
                    }
                  }}
                >
                  {option.icon && (
                    <span style={{ opacity: 0.7, display: 'flex', flexShrink: 0 }}>
                      {option.icon}
                    </span>
                  )}
                  {option.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface DropdownAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  icon?: React.ReactNode;
}

interface ToolbarDropdownWithActionsProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  actions?: DropdownAction[];
  placeholder?: string;
}

export function ToolbarDropdownWithActions({
  value,
  options,
  onChange,
  icon,
  actions = [],
  placeholder = 'Seleccionar',
}: ToolbarDropdownWithActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '30px',
          borderRadius: DIMENSIONS.radius.sm,
          border: 'none',
          background: 'transparent',
          padding: '0 8px',
          fontSize: '12px',
          color: isOpen ? COLORS.accent : COLORS.textSecondary,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          transition: TRANSITIONS.hover,
          fontFamily: TYPOGRAPHY.fontFamily,
          fontWeight: 500,
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = COLORS.bgMuted;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {icon && (
          <span style={{ opacity: 0.7, display: 'flex' }}>
            {icon}
          </span>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>{displayLabel}</span>
        <ChevronDown
          size={12}
          style={{
            opacity: 0.6,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: TRANSITIONS.transform,
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            zIndex: 100,
            minWidth: '180px',
            borderRadius: DIMENSIONS.radius.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            boxShadow: SHADOWS.lg,
            padding: '4px',
            animation: `${TRANSITIONS.smooth} ease-out`,
          }}
        >
          {options.map((option) => (
            <div
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  padding: '6px 8px',
                  borderRadius: DIMENSIONS.radius.sm,
                  border: 'none',
                  background: option.value === value ? COLORS.accentSoft : 'transparent',
                  color: option.value === value ? COLORS.accentText : COLORS.textSecondary,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: TRANSITIONS.colors,
                  fontFamily: TYPOGRAPHY.fontFamily,
                }}
                onMouseEnter={(e) => {
                  setHoveredOption(option.value);
                  if (option.value !== value) {
                    e.currentTarget.style.background = COLORS.bgMuted;
                    e.currentTarget.style.color = COLORS.text;
                  }
                }}
                onMouseLeave={(e) => {
                  setHoveredOption(null);
                  if (option.value !== value) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = COLORS.textSecondary;
                  }
                }}
              >
                {option.icon && (
                  <span style={{ opacity: 0.7, display: 'flex', flexShrink: 0 }}>
                    {option.icon}
                  </span>
                )}
                {option.label}
              </button>
              {hoveredOption === option.value && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const action = actions.find(a => a.label === 'Guardar');
                    if (action) action.onClick();
                    setIsOpen(false);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: DIMENSIONS.radius.sm,
                    border: 'none',
                    background: 'transparent',
                    color: COLORS.textTertiary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: TRANSITIONS.colors,
                    fontFamily: TYPOGRAPHY.fontFamily,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = COLORS.accent;
                    e.currentTarget.style.background = COLORS.bgMuted;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = COLORS.textTertiary;
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Guardar esta vista"
                >
                  <Save size={14} />
                </button>
              )}
            </div>
          ))}

          {actions.length > 0 && (
            <>
              <div
                style={{
                  height: '1px',
                  background: COLORS.border,
                  margin: '4px 0',
                }}
              />
              {actions.map((action, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    action.onClick();
                    setIsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    borderRadius: DIMENSIONS.radius.sm,
                    border: 'none',
                    background: action.variant === 'primary' ? COLORS.accentSoft : 'transparent',
                    color: action.variant === 'danger' 
                      ? COLORS.danger 
                      : action.variant === 'primary' 
                        ? COLORS.accentText 
                        : COLORS.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: TRANSITIONS.colors,
                    fontFamily: TYPOGRAPHY.fontFamily,
                    fontWeight: action.variant === 'primary' ? 500 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (action.variant !== 'primary' && action.variant !== 'danger') {
                      e.currentTarget.style.background = COLORS.bgMuted;
                      e.currentTarget.style.color = COLORS.text;
                    } else if (action.variant === 'danger') {
                      e.currentTarget.style.background = COLORS.dangerSoft;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (action.variant !== 'primary' && action.variant !== 'danger') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = COLORS.textSecondary;
                    } else if (action.variant === 'danger') {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {action.icon && (
                    <span style={{ display: 'flex', flexShrink: 0 }}>
                      {action.icon}
                    </span>
                  )}
                  {action.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

interface FilterChipProps {
  chip: ActiveFilterChip;
}

function FilterChip({ chip }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={chip.onRemove}
      style={{
        height: '28px',
        borderRadius: DIMENSIONS.radius.full,
        border: `1px solid ${COLORS.borderSubtle}`,
        background: COLORS.bgSubtle,
        padding: '0 10px',
        fontSize: '12px',
        color: COLORS.textSecondary,
        cursor: 'pointer',
        transition: TRANSITIONS.hover,
        fontFamily: TYPOGRAPHY.fontFamily,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = COLORS.bgMuted;
        e.currentTarget.style.color = COLORS.text;
        e.currentTarget.style.borderColor = COLORS.border;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = COLORS.bgSubtle;
        e.currentTarget.style.color = COLORS.textSecondary;
        e.currentTarget.style.borderColor = COLORS.borderSubtle;
      }}
    >
      {chip.label}
      <X size={12} style={{ opacity: 0.6 }} />
    </button>
  );
}

interface ModernToolbarProps {
  children?: React.ReactNode;
  chips?: ActiveFilterChip[];
  onClearAll?: () => void;
  showMilestonesOnly?: boolean;
  onToggleMilestones?: () => void;
}

export function ModernToolbar({
  children,
  chips = [],
  onClearAll,
  showMilestonesOnly,
  onToggleMilestones,
}: ModernToolbarProps) {
  const hasActiveFilters = chips.length > 0 || showMilestonesOnly;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        padding: '12px 0',
      }}
    >
      {children}

      {hasActiveFilters && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {chips.map((chip) => (
            <FilterChip key={chip.id} chip={chip} />
          ))}

          {showMilestonesOnly && onToggleMilestones && (
            <button
              type="button"
              onClick={onToggleMilestones}
              style={{
                height: '28px',
                borderRadius: DIMENSIONS.radius.full,
                border: `1px solid ${COLORS.borderSubtle}`,
                background: COLORS.accentSoft,
                padding: '0 10px',
                fontSize: '12px',
                color: COLORS.accentText,
                cursor: 'pointer',
                transition: TRANSITIONS.hover,
                fontFamily: TYPOGRAPHY.fontFamily,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.dangerSoft;
                e.currentTarget.style.color = COLORS.danger;
                e.currentTarget.style.borderColor = COLORS.danger;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.accentSoft;
                e.currentTarget.style.color = COLORS.accentText;
                e.currentTarget.style.borderColor = COLORS.borderSubtle;
              }}
            >
              Solo hitos
              <X size={12} />
            </button>
          )}

          {onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                height: '28px',
                borderRadius: DIMENSIONS.radius.full,
                border: `1px solid ${COLORS.danger}`,
                background: COLORS.dangerSoft,
                padding: '0 10px',
                fontSize: '12px',
                color: COLORS.danger,
                cursor: 'pointer',
                transition: TRANSITIONS.hover,
                fontFamily: TYPOGRAPHY.fontFamily,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.danger;
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.dangerSoft;
                e.currentTarget.style.color = COLORS.danger;
              }}
            >
              Limpiar todo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const TOOLBAR_ICONS = {
  view: <Eye size={14} />,
  group: <Layers size={14} />,
  order: <ArrowUpDown size={14} />,
  color: <Palette size={14} />,
  filter: <Filter size={14} />,
};

interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  icon?: React.ReactNode;
  options: FilterDropdownOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function FilterDropdown({
  label,
  icon,
  options,
  selectedValues,
  onChange,
  placeholder = 'Seleccionar',
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasSelection = selectedValues.length > 0;
  const displayLabel = hasSelection 
    ? `${label} (${selectedValues.length})` 
    : label;

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '30px',
          borderRadius: DIMENSIONS.radius.sm,
          border: 'none',
          background: hasSelection ? COLORS.accentSoft : 'transparent',
          padding: '0 8px',
          fontSize: '12px',
          color: hasSelection ? COLORS.accent : COLORS.textSecondary,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          transition: TRANSITIONS.hover,
          fontFamily: TYPOGRAPHY.fontFamily,
          fontWeight: 500,
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!hasSelection) {
            e.currentTarget.style.background = COLORS.bgMuted;
          }
        }}
        onMouseLeave={(e) => {
          if (!hasSelection) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        {icon && (
          <span style={{ opacity: 0.7, display: 'flex' }}>
            {icon}
          </span>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>{displayLabel}</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            zIndex: 100,
            minWidth: '180px',
            maxHeight: '240px',
            overflowY: 'auto',
            borderRadius: DIMENSIONS.radius.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            boxShadow: SHADOWS.lg,
            padding: '4px',
            animation: `${TRANSITIONS.smooth} ease-out`,
          }}
        >
          {options.length === 0 ? (
            <div style={{
              padding: '8px 10px',
              fontSize: '12px',
              color: COLORS.textTertiary,
              fontFamily: TYPOGRAPHY.fontFamily,
            }}>
              Sin opciones disponibles
            </div>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: DIMENSIONS.radius.sm,
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: selectedValues.includes(option.value) ? COLORS.accentText : COLORS.textSecondary,
                  background: selectedValues.includes(option.value) ? COLORS.accentSoft : 'transparent',
                  fontFamily: TYPOGRAPHY.fontFamily,
                  transition: TRANSITIONS.colors,
                }}
                onMouseEnter={(e) => {
                  if (!selectedValues.includes(option.value)) {
                    e.currentTarget.style.background = COLORS.bgMuted;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selectedValues.includes(option.value)) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => toggleOption(option.value)}
                  style={{
                    width: '14px',
                    height: '14px',
                    cursor: 'pointer',
                    accentColor: COLORS.accent,
                  }}
                />
                {option.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface FilterGroup {
  id: string;
  label: string;
  options: FilterDropdownOption[];
}

interface UnifiedFilterDropdownProps {
  groups: FilterGroup[];
  selections: Record<string, string[]>;
  onChange: (groupId: string, values: string[]) => void;
  showOnlyActive?: boolean;
  onToggleOnlyActive?: () => void;
}

export function UnifiedFilterDropdown({
  groups,
  selections,
  onChange,
  showOnlyActive = false,
  onToggleOnlyActive,
}: UnifiedFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSelections = Object.values(selections).reduce((acc, arr) => acc + arr.length, 0) + (showOnlyActive ? 1 : 0);
  const displayLabel = totalSelections > 0 
    ? `Filtros (${totalSelections})` 
    : 'Filtros';

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOption = (groupId: string, value: string) => {
    const current = selections[groupId] || [];
    if (current.includes(value)) {
      onChange(groupId, current.filter(v => v !== value));
    } else {
      onChange(groupId, [...current, value]);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: '30px',
          borderRadius: DIMENSIONS.radius.sm,
          border: 'none',
          background: totalSelections > 0 ? COLORS.accentSoft : 'transparent',
          padding: '0 8px',
          fontSize: '12px',
          color: totalSelections > 0 ? COLORS.accent : COLORS.textSecondary,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          transition: TRANSITIONS.hover,
          fontFamily: TYPOGRAPHY.fontFamily,
          fontWeight: 500,
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (totalSelections === 0) {
            e.currentTarget.style.background = COLORS.bgMuted;
          }
        }}
        onMouseLeave={(e) => {
          if (totalSelections === 0) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <Filter size={14} />
        <span style={{ whiteSpace: 'nowrap' }}>{displayLabel}</span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '34px',
            left: 0,
            zIndex: 100,
            minWidth: '220px',
            maxHeight: '320px',
            overflowY: 'auto',
            borderRadius: DIMENSIONS.radius.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.bg,
            boxShadow: SHADOWS.lg,
            padding: '6px',
            animation: `${TRANSITIONS.smooth} ease-out`,
          }}
        >
          {onToggleOnlyActive && (
            <button
              type="button"
              onClick={onToggleOnlyActive}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: DIMENSIONS.radius.sm,
                border: 'none',
                background: showOnlyActive ? COLORS.accentSoft : 'transparent',
                color: showOnlyActive ? COLORS.accentText : COLORS.textSecondary,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: TRANSITIONS.colors,
                fontFamily: TYPOGRAPHY.fontFamily,
                fontWeight: 500,
                marginBottom: '4px',
              }}
              onMouseEnter={(e) => {
                if (!showOnlyActive) {
                  e.currentTarget.style.background = COLORS.bgMuted;
                }
              }}
              onMouseLeave={(e) => {
                if (!showOnlyActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                border: `1.5px solid ${showOnlyActive ? COLORS.accent : COLORS.border}`,
                background: showOnlyActive ? COLORS.accent : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: TRANSITIONS.colors,
              }}>
                {showOnlyActive && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              Solo activos
            </button>
          )}
          {onToggleOnlyActive && (
            <div style={{ height: '1px', background: COLORS.border, margin: '4px 0' }} />
          )}
          {groups.map((group) => (
            <div key={group.id}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: COLORS.textTertiary,
                  padding: '6px 8px 4px',
                  fontFamily: TYPOGRAPHY.fontFamily,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {group.label}
              </div>
              {group.options.length === 0 ? (
                <div style={{
                  padding: '6px 8px',
                  fontSize: '12px',
                  color: COLORS.textTertiary,
                  fontFamily: TYPOGRAPHY.fontFamily,
                }}>
                  Sin opciones
                </div>
              ) : (
                group.options.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '5px 8px',
                      borderRadius: DIMENSIONS.radius.sm,
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: (selections[group.id] || []).includes(option.value) ? COLORS.accentText : COLORS.textSecondary,
                      background: (selections[group.id] || []).includes(option.value) ? COLORS.accentSoft : 'transparent',
                      fontFamily: TYPOGRAPHY.fontFamily,
                      transition: TRANSITIONS.colors,
                    }}
                    onMouseEnter={(e) => {
                      if (!(selections[group.id] || []).includes(option.value)) {
                        e.currentTarget.style.background = COLORS.bgMuted;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!(selections[group.id] || []).includes(option.value)) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={(selections[group.id] || []).includes(option.value)}
                      onChange={() => toggleOption(group.id, option.value)}
                      style={{
                        width: '14px',
                        height: '14px',
                        cursor: 'pointer',
                        accentColor: COLORS.accent,
                      }}
                    />
                    {option.label}
                  </label>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
