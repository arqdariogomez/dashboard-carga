import { AlertCircle, AlertTriangle, Info, Check, Zap } from 'lucide-react';
import type { ValidationIssue } from '../helpers/validationEngine';

interface ValidationMessageProps {
  issue: ValidationIssue;
  onAutoFix?: (issue: ValidationIssue) => void;
}

export function ValidationMessage({ issue, onAutoFix }: ValidationMessageProps) {
  const iconMap = {
    error: <AlertCircle size={14} className="text-[#B71C1C] flex-shrink-0 mt-0.5" />,
    warning: <AlertTriangle size={14} className="text-[#7D6608] flex-shrink-0 mt-0.5" />,
    info: <Info size={14} className="text-[#1A5276] flex-shrink-0 mt-0.5" />,
  };

  const bgMap = {
    error: 'bg-accent-red/30 border-[#B71C1C]/20',
    warning: 'bg-accent-yellow/30 border-[#7D6608]/20',
    info: 'bg-accent-blue/30 border-[#1A5276]/20',
  };

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${bgMap[issue.severity]}`}>
      {iconMap[issue.severity]}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary leading-relaxed">{issue.message}</p>
        {issue.suggestion && (
          <p className="text-[11px] text-text-secondary mt-0.5">{issue.suggestion}</p>
        )}
      </div>
      {issue.autoFixable && onAutoFix && (
        <button
          onClick={() => onAutoFix(issue)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white border border-border hover:bg-bg-secondary transition-colors text-text-primary flex-shrink-0"
        >
          <Zap size={10} /> Corregir
        </button>
      )}
    </div>
  );
}

interface ValidationSummaryProps {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  validRowCount: number;
  totalRowCount: number;
}

export function ValidationSummary({
  errorCount,
  warningCount,
  infoCount,
  validRowCount,
  totalRowCount,
}: ValidationSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-bg-secondary border border-border">
      {/* Valid rows */}
      <div className="flex items-center gap-1.5">
        <Check size={14} className="text-[#2D6A2E]" />
        <span className="text-sm font-medium text-[#2D6A2E]">
          {validRowCount}
        </span>
        <span className="text-xs text-text-secondary">
          proyectos listos
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Errors */}
      {errorCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertCircle size={14} className="text-[#B71C1C]" />
          <span className="text-sm font-medium text-[#B71C1C]">
            {errorCount}
          </span>
          <span className="text-xs text-text-secondary">
            error{errorCount !== 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {/* Warnings */}
      {warningCount > 0 && (
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-[#7D6608]" />
          <span className="text-sm font-medium text-[#7D6608]">
            {warningCount}
          </span>
          <span className="text-xs text-text-secondary">
            advertencia{warningCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Info */}
      {infoCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-[#1A5276]" />
          <span className="text-sm font-medium text-[#1A5276]">
            {infoCount}
          </span>
          <span className="text-xs text-text-secondary">
            nota{infoCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {totalRowCount !== validRowCount && (
        <>
          <div className="w-px h-4 bg-border" />
          <span className="text-xs text-text-secondary">
            de {totalRowCount} filas totales
          </span>
        </>
      )}
    </div>
  );
}
