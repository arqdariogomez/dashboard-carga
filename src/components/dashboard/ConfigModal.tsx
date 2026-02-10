import { useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { X, Plus, Trash2 } from 'lucide-react';
import type { NonWorkingDay } from '@/lib/types';
import { computeProjectFields } from '@/lib/workloadEngine';

interface ConfigModalProps {
  onClose: () => void;
}

export function ConfigModal({ onClose }: ConfigModalProps) {
  const { state, dispatch } = useProject();
  const [hoursPerDay, setHoursPerDay] = useState(state.config.hoursPerDay);
  const [weekendDays, setWeekendDays] = useState<number[]>(state.config.weekendDays);
  const [holidays, setHolidays] = useState<NonWorkingDay[]>(state.config.holidays);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayRecurring, setNewHolidayRecurring] = useState(true);

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const toggleWeekend = (day: number) => {
    setWeekendDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName) return;
    setHolidays((prev) => [
      ...prev,
      { date: new Date(newHolidayDate + 'T12:00:00'), reason: newHolidayName, recurring: newHolidayRecurring },
    ]);
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const removeHoliday = (idx: number) => {
    setHolidays((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const newConfig = { ...state.config, hoursPerDay, weekendDays, holidays };
    dispatch({ type: 'SET_CONFIG', payload: newConfig });
    // Recompute projects with new config
    if (state.projects.length > 0) {
      const recomputed = state.projects.map((p) => computeProjectFields(p, newConfig));
      dispatch({ type: 'SET_PROJECTS', payload: { projects: recomputed, fileName: state.fileName || '' } });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">Configuración</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-secondary transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Hours per day */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Horas por día laboral</label>
            <input
              type="number"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              min={1}
              max={24}
              className="w-20 px-3 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-person-1/30 focus:border-person-1"
            />
          </div>

          {/* Weekend days */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Días no laborales</label>
            <div className="flex gap-2">
              {dayNames.map((name, i) => (
                <button
                  key={i}
                  onClick={() => toggleWeekend(i)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    weekendDays.includes(i)
                      ? 'bg-accent-red text-[#B71C1C]'
                      : 'bg-bg-secondary text-text-secondary hover:bg-accent-green'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Holidays */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Días feriados</label>
            <div className="space-y-1.5 mb-3 max-h-[200px] overflow-y-auto">
              {holidays.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-bg-secondary rounded px-2.5 py-1.5">
                  <span className="tabular-nums">
                    {h.date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="flex-1 text-text-primary">{h.reason}</span>
                  {h.recurring && <span className="text-text-secondary">🔁</span>}
                  <button onClick={() => removeHoliday(i)} className="text-text-secondary hover:text-[#B71C1C] transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="px-2 py-1.5 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-person-1/30"
              />
              <input
                type="text"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                placeholder="Nombre"
                className="flex-1 px-2 py-1.5 border border-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-person-1/30"
              />
              <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={newHolidayRecurring} onChange={(e) => setNewHolidayRecurring(e.target.checked)} />
                Anual
              </label>
              <button onClick={addHoliday} className="p-1.5 rounded bg-accent-blue text-[#1A5276] hover:bg-[#b8d4e3] transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium bg-text-primary text-white rounded-md hover:bg-[#2c2a25] transition-colors">
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
