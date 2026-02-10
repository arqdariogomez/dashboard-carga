import type { Project, PersonWorkload, ProjectLoad, AppConfig, FilterState, Granularity } from './types';
import { getWorkingDays, countWorkingDays, isSameDay, getWeekRanges, getMonthRanges } from './dateUtils';
import { getDescendants, isParent, getAncestors } from './hierarchyEngine';

export function computeProjectFields(project: Omit<Project, 'assignedDays' | 'balanceDays' | 'dailyLoad' | 'totalHours'>, config: AppConfig, allProjects?: Project[]): Project {
  let assignedDays = 0;
  let balanceDays = 0;
  let dailyLoad = 0;
  let totalHours = 0;

  // If this is a parent project, use aggregated dates from children
  let startDate = project.startDate;
  let endDate = project.endDate;
  let assignees = project.assignees;
  let daysRequired = project.daysRequired;
  let priority = project.priority;

  if (allProjects && isParent(project.id, allProjects)) {
    const descendants = getDescendants(project.id, allProjects);
    if (descendants.length > 0) {
      // Aggregated dates: min start, max end
      const allDates = descendants
        .flatMap(p => {
          const dates: Date[] = [];
          if (p.startDate) dates.push(p.startDate);
          if (p.endDate) dates.push(p.endDate);
          return dates;
        });

      if (allDates.length > 0) {
        startDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        endDate = new Date(Math.max(...allDates.map(d => d.getTime())));
      }

      // Aggregated assignees: unique set
      const allAssignees = new Set<string>();
      descendants.forEach(p => {
        p.assignees.forEach(a => allAssignees.add(a));
      });
      assignees = Array.from(allAssignees).sort();

      // Aggregated daysRequired: sum
      daysRequired = descendants.reduce((sum, p) => sum + p.daysRequired, 0);

      // Aggregated priority: weighted average by daysRequired
      const totalDays = daysRequired || 1;
      priority = Math.round(
        descendants.reduce((sum, p) => sum + p.priority * p.daysRequired, 0) / totalDays
      );
    }
  }

  if (startDate && endDate) {
    assignedDays = countWorkingDays(startDate, endDate, config);
    balanceDays = assignedDays - daysRequired;
    dailyLoad = assignedDays > 0 ? daysRequired / assignedDays : 0;
    totalHours = daysRequired * config.hoursPerDay;
  }

  return {
    ...project,
    startDate,
    endDate,
    assignees,
    daysRequired,
    priority,
    assignedDays,
    balanceDays,
    dailyLoad,
    totalHours,
  } as Project;
}

export function getActiveProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.startDate && p.endDate && p.assignees.length > 0);
}

export function getPersons(projects: Project[]): string[] {
  const persons = new Set<string>();
  projects.forEach((p) => {
    p.assignees.forEach((assignee) => {
      persons.add(assignee);
    });
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

export function applyFilters(projects: Project[], filters: FilterState, config: AppConfig): Project[] {
  // First pass: apply basic filters per-project
  const matched = projects.filter((p) => {
    if (filters.persons.length > 0) {
      const hasMatchingPerson = p.assignees.some(assignee => filters.persons.includes(assignee));
      if (!hasMatchingPerson) return false;
    }
    if (filters.branches.length > 0 && !filters.branches.includes(p.branch)) return false;
    if (filters.types.length > 0 && !filters.types.includes(p.type)) return false;
    if (filters.showOnlyActive && p.type === 'En radar') return false;
    if (filters.dateRange && p.startDate && p.endDate) {
      if (p.endDate < filters.dateRange.start || p.startDate > filters.dateRange.end) return false;
    }
    return true;
  });

  // Expand to include ancestors (parents) of matched projects so hierarchy remains visible
  const includeIds = new Set<string>();
  matched.forEach(p => {
    includeIds.add(p.id);
    const ancestors = getAncestors(p.id, projects);
    ancestors.forEach(a => includeIds.add(a.id));
  });

  // Preserve original order from `projects` argument
  const expanded = projects.filter(p => includeIds.has(p.id));

  // Recompute aggregated fields for the expanded set so parent rows summarize only visible children
  const recomputed = expanded.map(p => computeProjectFields(p, config, expanded));
  return recomputed;
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
    const personProjects = activeProjects.filter((p) => p.assignees.includes(person));
    const workloads: PersonWorkload[] = [];

    for (const day of workingDays) {
      const projectLoads: ProjectLoad[] = [];
      let totalLoad = 0;

      for (const proj of personProjects) {
        if (proj.startDate && proj.endDate && day >= proj.startDate && day <= proj.endDate) {
          // Distribute load among all assignees
          const loadPerAssignee = proj.dailyLoad / proj.assignees.length;
          if (loadPerAssignee > 0) {
            projectLoads.push({
              projectId: proj.id,
              projectName: proj.name,
              dailyLoad: loadPerAssignee,
            });
            totalLoad += loadPerAssignee;
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
  const personProjects = projects.filter((p) => p.assignees.includes(person));
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
