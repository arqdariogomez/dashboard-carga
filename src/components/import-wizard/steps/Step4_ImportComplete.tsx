import { CheckCircle, Users, Calendar, FolderOpen, Lightbulb, ArrowRight } from 'lucide-react';
import type { Project } from '@/lib/types';

interface Step4Props {
  projects: Project[];
  fileName: string;
  onFinish: () => void;
}

export function Step4_ImportComplete({ projects, fileName, onFinish }: Step4Props) {
  // Calculate stats
  const persons = [...new Set(projects.flatMap(p => p.assignees))];
  const activeDates = projects.filter(p => p.startDate && p.endDate);
  
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const p of activeDates) {
    if (p.startDate && (!minDate || p.startDate < minDate)) minDate = p.startDate;
    if (p.endDate && (!maxDate || p.endDate > maxDate)) maxDate = p.endDate;
  }

  const projectTypes = {
    proyecto: projects.filter(p => p.type === 'Proyecto').length,
    lanzamiento: projects.filter(p => p.type === 'Lanzamiento').length,
    enRadar: projects.filter(p => p.type === 'En radar').length,
  };

  const withDates = projects.filter(p => p.startDate && p.endDate).length;
  const withoutDates = projects.length - withDates;

  return (
    <div className="max-w-lg mx-auto text-center space-y-8 py-6">
      {/* Success icon */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-accent-green flex items-center justify-center">
          <CheckCircle size={40} className="text-[#2D6A2E]" />
        </div>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          ¡Importación completada!
        </h2>
        <p className="text-sm text-text-secondary">
          Datos cargados desde <strong className="text-text-primary">{fileName}</strong>
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 text-left">
        <div className="p-4 rounded-xl bg-accent-blue/20 border border-[#1A5276]/10">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={14} className="text-[#1A5276]" />
            <span className="text-xs text-text-secondary">Proyectos</span>
          </div>
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {projects.length}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {projectTypes.proyecto > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-secondary">
                {projectTypes.proyecto} proyectos
              </span>
            )}
            {projectTypes.lanzamiento > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-blue text-[#1A5276]">
                {projectTypes.lanzamiento} lanzamientos
              </span>
            )}
            {projectTypes.enRadar > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary">
                {projectTypes.enRadar} en radar
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-accent-green/20 border border-[#2D6A2E]/10">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-[#2D6A2E]" />
            <span className="text-xs text-text-secondary">Personas</span>
          </div>
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {persons.length}
          </p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {persons.map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border text-text-secondary">
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-accent-yellow/20 border border-[#7D6608]/10">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={14} className="text-[#7D6608]" />
            <span className="text-xs text-text-secondary">Rango</span>
          </div>
          {minDate && maxDate ? (
            <p className="text-sm font-medium text-text-primary">
              {minDate.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })} — {maxDate.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">Sin rango definido</p>
          )}
          <p className="text-[10px] text-text-secondary mt-1">
            {withDates} con fechas · {withoutDates} sin programar
          </p>
        </div>

        <div className="p-4 rounded-xl bg-accent-purple/20 border border-person-4/10">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-text-secondary">Dependencias</span>
          </div>
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {projects.filter(p => p.blockedBy || p.blocksTo).length}
          </p>
          <p className="text-[10px] text-text-secondary mt-1">
            proyectos con relaciones
          </p>
        </div>
      </div>

      {/* Tip */}
      <div className="flex items-start gap-3 text-left p-4 rounded-xl bg-bg-secondary border border-border">
        <Lightbulb size={16} className="text-[#7D6608] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-text-primary">Tip</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Puedes recargar el archivo en cualquier momento con el botón 🔄 en el header
            o presionando <kbd className="px-1 py-0.5 rounded bg-white border border-border text-[10px]">Ctrl+R</kbd>.
            Los filtros y la vista se mantienen al recargar.
          </p>
        </div>
      </div>

      {/* Finish button */}
      <button
        onClick={onFinish}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-text-primary text-white text-sm font-medium hover:bg-text-primary/90 transition-colors"
      >
        Ir al Dashboard
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
