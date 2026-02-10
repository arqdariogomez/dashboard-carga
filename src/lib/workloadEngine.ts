import type { Project, PersonWorkload, ProjectLoad, AppConfig, FilterState, Granularity } from './types';
import { getWorkingDays, countWorkingDays, isSameDay, getWeekRanges, getMonthRanges } from './dateUtils';

export function computeProjectFields(project: Omit<Project, 'assignedDays' | 'balanceDays' | 'dailyLoad' | 'totalHours'>, config: AppConfig): Project {
  let assignedDays = 0;
  let balanceDays = 0;
  let dailyLoad = 0;
  let totalHours = 0;

  if (project.startDate && project.endDate) {
    assignedDays = countWorkingDays(project.startDate, project.endDate, config);
    balanceDays = assignedDays - project.daysRequired;
    dailyLoad = assignedDays > 0 ? project.daysRequired / assignedDays : 0;
    totalHours = project.daysRequired * config.hoursPerDay;
  }

  return {
    ...project,
    assignedDays,
    balanceDays,
    dailyLoad,
    totalHours,
  } as Project;
}

export function getActiveProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.startDate && p.endDate && p.assignee);
}

export function getPersons(projects: Project[]): string[] {
  const persons = new Set<string>();
  projects.forEach((p) => {
    if (p.assignee) persons.add(p.assignee);
  });
  return Array.from(persons).sort();
}

export function getBranches(projects: Project[]): string[] {
  const branches = new Set<string>();
  projects.forEach((p) => {
    if (p.branch) branches.add(p.branch);
  });
  return Array.from(branches).sort();
}

export function applyFilters(projects: Project[], filters: FilterState): Project[] {
  return projects.filter((p) => {
    if (filters.persons.length > 0 && p.assignee && !filters.persons.includes(p.assignee)) return false;
    if (filters.persons.length > 0 && !p.assignee) return false;
    if (filters.branches.length > 0 && !filters.branches.includes(p.branch)) return false;
    if (filters.types.length > 0 && !filters.types.includes(p.type)) return false;
    if (filters.showOnlyActive && p.type === 'En radar') return false;
    if (filters.dateRange && p.startDate && p.endDate) {
      if (p.endDate < filters.dateRange.start || p.startDate > filters.dateRange.end) return false;
    }
    return true;
  });
}

export function calculateDailyWorkload(
  projects: Project[],
  config: AppConfig,
  dateRange: { start: Date; end: Date }
): Map<string, PersonWorkload[]> {
  const activeProjects = getActiveProjects(projects);
  const persons = getPersons(activeProjects);
  const result = new Map<string, PersonWorkload[]>();

  const workingDays = getWorkingDays(dateRange.start, dateRange.end, config);

  for (const person of persons) {
    const personProjects = activeProjects.filter((p) => p.assignee === person);
    const workloads: PersonWorkload[] = [];

    for (const day of workingDays) {
      const projectLoads: ProjectLoad[] = [];
      let totalLoad = 0;

      for (const proj of personProjects) {
        if (proj.startDate && proj.endDate && day >= proj.startDate && day <= proj.endDate) {
          const load = proj.dailyLoad;
          if (load > 0) {
            projectLoads.push({
              projectId: proj.id,
              projectName: proj.name,
              dailyLoad: load,
            });
            totalLoad += load;
          }
        }
      }

      workloads.push({
        person,
        date: day,
        totalLoad,
        projects: projectLoads,
      });
    }

    result.set(person, workloads);
  }

  return result;
}

export function aggregateByPeriod(
  workloads: PersonWorkload[],
  granularity: Granularity,
  dateRange: { start: Date; end: Date },
  _config: AppConfig
): { start: Date; end: Date; label: string; avgLoad: number; projects: ProjectLoad[] }[] {
  if (granularity === 'day') {
    return workloads.map((w) => ({
      start: w.date,
      end: w.date,
      label: '',
      avgLoad: w.totalLoad,
      projects: w.projects,
    }));
  }

  const ranges = granularity === 'week'
    ? getWeekRanges(dateRange.start, dateRange.end)
    : getMonthRanges(dateRange.start, dateRange.end);

  return ranges.map((range) => {
    const daysInRange = workloads.filter(
      (w) => w.date >= range.start && w.date <= range.end
    );
    const avgLoad = daysInRange.length > 0
      ? daysInRange.reduce((sum, d) => sum + d.totalLoad, 0) / daysInRange.length
      : 0;

    const projectMap = new Map<string, ProjectLoad>();
    daysInRange.forEach((d) => {
      d.projects.forEach((p) => {
        if (!projectMap.has(p.projectId)) {
          projectMap.set(p.projectId, { ...p });
        }
      });
    });

    return {
      ...range,
      avgLoad,
      projects: Array.from(projectMap.values()),
    };
  });
}

export function getPersonSummary(
  person: string,
  projects: Project[],
  workloads: PersonWorkload[],
  _config: AppConfig
) {
  const personProjects = projects.filter((p) => p.assignee === person);
  const activeProjects = personProjects.filter((p) => p.startDate && p.endDate);
  const today = new Date();

  const todayWorkload = workloads.find((w) => isSameDay(w.date, today));
  const currentLoad = todayWorkload ? todayWorkload.totalLoad : 0;

  const avgLoad = workloads.length > 0
    ? workloads.reduce((sum, w) => sum + w.totalLoad, 0) / workloads.length
    : 0;

  let peakLoad = 0;
  let peakDate: Date | null = null;
  workloads.forEach((w) => {
    if (w.totalLoad > peakLoad) {
      peakLoad = w.totalLoad;
      peakDate = w.date;
    }
  });

  const upcomingProjects = activeProjects
    .filter((p) => p.startDate && p.startDate >= today)
    .sort((a, b) => (a.startDate!.getTime() - b.startDate!.getTime()))
    .slice(0, 3);

  return {
    person,
    totalProjects: personProjects.length,
    activeProjects: activeProjects.length,
    currentLoad,
    avgLoad,
    peakLoad,
    peakDate,
    upcomingProjects,
  };
}
