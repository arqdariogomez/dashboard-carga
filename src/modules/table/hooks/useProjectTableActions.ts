import { useCallback } from 'react';
import type { Project } from '@/lib/types';
import { computeProjectFields } from '@/lib/workloadEngine';
import { exportToExcel, copyAsCSV } from '@/lib/exportUtils';

interface UseProjectTableActionsProps {
  state: {
    projects: Project[];
    projectOrder: string[];
    config: any;
  };
  dispatch: (action: any) => void;
  setBranchCatalog: (catalog: string[]) => void;
  setPersonCatalog?: (catalog: string[]) => void;
  setPersonProfiles: (profiles: Record<string, { avatarUrl?: string }>) => void;
  setMultiSelectMode: (mode: boolean) => void;
  setSelectedRowIds: (ids: Set<string>) => void;
  setSelectedRowId: (id: string | null) => void;
  setLastSelectedRowId: (id: string | null) => void;
}

// Helper functions
const normalizePersonKey = (name: string): string => {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

const normalizeTagList = (tags: string[]): string[] => {
  return [...new Set(tags.map(t => t.trim()).filter(Boolean))];
};
const equalsIgnoreCase = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useProjectTableActions({
  state,
  dispatch,
  setBranchCatalog,
  setPersonCatalog,
  setPersonProfiles,
  setMultiSelectMode,
  setSelectedRowIds,
  setSelectedRowId,
  setLastSelectedRowId,
}: UseProjectTableActionsProps) {
  // Defensa contra state undefined
  const safeState = state || { projects: [], projectOrder: [], config: {} };

  // Basic CRUD operations
  const handleUpdate = useCallback((id: string, updates: Partial<Project>) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } });
  }, [dispatch]);

  const handleDelete = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, [dispatch]);

  const handleToggleExpand = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_EXPANSION', payload: id });
  }, [dispatch]);

  // Branch operations
  const handleAddBranchOption = useCallback((label: string) => {
    const clean = label.trim();
    if (clean) {
      setBranchCatalog(prev => normalizeTagList([...prev, clean]));
    }
  }, [setBranchCatalog]);

  // Person catalog operations
  const handleAddPersonOption = useCallback((name: string) => {
    const clean = name.trim();
    if (clean && setPersonCatalog) {
      setPersonCatalog((prev: string[]) => {
        const current = new Set(prev.map(p => p.toLowerCase()));
        if (!current.has(clean.toLowerCase())) {
          const updated = [...prev, clean].sort();
          return updated;
        }
        return prev;
      });
    }
  }, [setPersonCatalog]);

  const handleRenameBranchOption = useCallback((from: string, to: string) => {
    const fromClean = from.trim();
    const toClean = to.trim();
    if (!fromClean || !toClean) return;

    const updates = (state.projects || []).reduce((acc, project) => {
      const oldBranches = Array.isArray(project.branch) ? project.branch : [];
      const newBranches = normalizeTagList(oldBranches.map((b) => equalsIgnoreCase(b, fromClean) ? toClean : b));
      if (JSON.stringify(oldBranches) !== JSON.stringify(newBranches)) {
        acc[project.id] = { branch: newBranches };
      }
      return acc;
    }, {} as Record<string, { branch: string[] }>);

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
    }
    setBranchCatalog(prev => normalizeTagList([...prev.filter((b) => !equalsIgnoreCase(b, fromClean)), toClean]));
  }, [state.projects, dispatch, setBranchCatalog]);

  const handleDeleteBranchOption = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) return;

    const updates = (state.projects || []).reduce((acc, project) => {
      const oldBranches = Array.isArray(project.branch) ? project.branch : [];
      const newBranches = oldBranches.filter((b) => !equalsIgnoreCase(b, clean));
      if (oldBranches.length !== newBranches.length) {
        acc[project.id] = { branch: newBranches };
      }
      return acc;
    }, {} as Record<string, { branch: string[] }>);

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
    }
    setBranchCatalog(prev => prev.filter((b) => !equalsIgnoreCase(b, clean)));
  }, [state.projects, dispatch, setBranchCatalog]);

  const handleMergeBranchOptions = useCallback((left: string, right: string, keep: string) => {
    const leftClean = left.trim();
    const rightClean = right.trim();
    const keepClean = keep.trim();
    if (!leftClean || !rightClean || !keepClean) return;

    const updates = (state.projects || []).reduce((acc, project) => {
      const oldBranches = Array.isArray(project.branch) ? project.branch : [];
      const next = normalizeTagList(
        oldBranches.map((b) => (equalsIgnoreCase(b, leftClean) || equalsIgnoreCase(b, rightClean)) ? keepClean : b),
      );
      if (JSON.stringify(oldBranches) !== JSON.stringify(next)) {
        acc[project.id] = { branch: next };
      }
      return acc;
    }, {} as Record<string, { branch: string[] }>);

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
    }
    setBranchCatalog((prev) => normalizeTagList([
      ...prev.filter((b) => !equalsIgnoreCase(b, leftClean) && !equalsIgnoreCase(b, rightClean)),
      keepClean,
    ]));
  }, [state.projects, dispatch, setBranchCatalog]);

  // Person operations
  const handleRenamePersonGlobal = useCallback(async (from: string, to: string) => {
    const fromClean = from.trim();
    const toClean = to.trim();
    if (fromClean && toClean) {
      const fromKey = normalizePersonKey(fromClean);
      const toKey = normalizePersonKey(toClean);

      const updates = (state.projects || []).reduce((acc, project) => {
        const oldAssignees = Array.isArray(project.assignees) ? project.assignees : [];
        const newAssignees = oldAssignees.map((a) => normalizePersonKey(a) === fromKey ? toClean : a);
        if (JSON.stringify(oldAssignees) !== JSON.stringify(newAssignees)) {
          acc[project.id] = { assignees: newAssignees };
        }
        return acc;
      }, {} as Record<string, { assignees: string[] }>);

      if (Object.keys(updates).length > 0) {
        dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
        setPersonProfiles((prev) => { const next = { ...prev }; if (next[fromKey]) next[toKey] = next[fromKey]; delete next[fromKey]; return next; });
      }
    }
  }, [state.projects, dispatch, setPersonProfiles]);

  const handleDeletePersonGlobal = useCallback(async (name: string) => {
    const clean = name.trim();
    if (clean) {
      const key = normalizePersonKey(clean);

      const updates = (state.projects || []).reduce((acc, project) => {
        const oldAssignees = Array.isArray(project.assignees) ? project.assignees : [];
        const newAssignees = oldAssignees.filter((a) => normalizePersonKey(a) !== key);
        if (oldAssignees.length !== newAssignees.length) {
          acc[project.id] = { assignees: newAssignees };
        }
        return acc;
      }, {} as Record<string, { assignees: string[] }>);

      if (Object.keys(updates).length > 0) {
        dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
        setPersonProfiles(prev => {
          const updated = { ...prev };
          delete updated[key];
          return updated;
        });
      }
    }
  }, [state.projects, dispatch, setPersonProfiles]);

  const handleMergePersonsGlobal = useCallback(async (left: string, right: string, keep: string) => {
    const leftClean = left.trim();
    const rightClean = right.trim();
    const keepClean = keep.trim();
    const leftKey = normalizePersonKey(leftClean);
    const rightKey = normalizePersonKey(rightClean);

    const updates = (state.projects || []).reduce((acc, project) => {
      const oldAssignees = Array.isArray(project.assignees) ? project.assignees : [];
      const newAssignees = oldAssignees.map((a) => {
        const aKey = normalizePersonKey(a);
        if (aKey === leftKey || aKey === rightKey) {
          return keepClean;
        }
        return a;
      });
      // Remove duplicates
      const uniqueAssignees = [...new Set(newAssignees)];
      if (JSON.stringify(oldAssignees) !== JSON.stringify(uniqueAssignees)) {
        acc[project.id] = { assignees: uniqueAssignees };
      }
      return acc;
    }, {} as Record<string, { assignees: string[] }>);

    if (Object.keys(updates).length > 0) {
      dispatch({ type: 'BULK_UPDATE_PROJECTS', payload: updates });
      setPersonProfiles((prev) => { const next = { ...prev }; const keepKey = normalizePersonKey(keepClean); next[keepKey] = next[leftKey] || next[rightKey]; delete next[leftKey]; delete next[rightKey]; return next; });
    }
  }, [state.projects, dispatch, setPersonProfiles]);

  const handleSetPersonAvatar = useCallback(async (name: string, file: File) => {
    if (file) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const key = normalizePersonKey(name);
      setPersonProfiles(prev => ({ ...prev, [key]: { avatarUrl: dataUrl } }));
    }
  }, [setPersonProfiles]);

  // Selection operations
  const handleToggleChecked = useCallback((id: string, checked: boolean) => {
    setMultiSelectMode(true);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, [setMultiSelectMode, setSelectedRowIds]);

  const handleRowSelect = useCallback((id: string, ev?: React.MouseEvent<HTMLElement>) => {
    const additive = !!(ev?.ctrlKey || ev?.metaKey);
    const range = !!ev?.shiftKey;
    const baseOrder = (safeState.projectOrder && safeState.projectOrder?.length > 0) ? safeState.projectOrder : (safeState.projects || []).map((p) => p.id);

    if (range && setLastSelectedRowId) {
      // Simplified range selection - would need lastSelectedRowId from state
      setSelectedRowIds(new Set([id]));
      setSelectedRowId(id);
      setLastSelectedRowId(id);
      return;
    }

    if (additive) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          if (setSelectedRowId) {
            setSelectedRowId(null);
          }
        } else {
          next.add(id);
          setSelectedRowId(id);
        }
        return next;
      });
    } else {
      setSelectedRowIds(new Set([id]));
      setSelectedRowId(id);
    }
    if (setLastSelectedRowId) {
      setLastSelectedRowId(id);
    }
  }, [state.projectOrder, state.projects, setSelectedRowIds, setSelectedRowId, setLastSelectedRowId]);

  // Project creation
  const createProjectDraft = useCallback((overrides?: Partial<Project>) => {
    const { id: _ignoreId, ...safeOverrides } = overrides || {};
    return computeProjectFields({
      id: `proj-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: 'Nuevo proyecto',
      branch: [],
      startDate: null,
      endDate: null,
      assignees: [],
      daysRequired: 0,
      priority: 1,
      type: 'Proyecto',
      blockedBy: null,
      blocksTo: null,
      reportedLoad: null,
      hierarchyLevel: 0,
      parentId: null,
      isExpanded: true,
      ...safeOverrides,
    }, state.config);
  }, [state.config]);

  const handleAddProject = useCallback(() => {
    const newProject = computeProjectFields({
      id: `proj-new-${Date.now()}`,
      name: '',
      hierarchyLevel: 0,
      parentId: null,
      isExpanded: true,
    }, state.config);
    dispatch({ type: 'ADD_PROJECT', payload: newProject });
  }, [state.config, dispatch]);

  const handleAddAbove = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (ref) {
      const newProject = createProjectDraft({
        hierarchyLevel: ref.hierarchyLevel || 0,
        parentId: ref.parentId,
        branch: Array.isArray(ref.branch) ? [...ref.branch] : [],
        startDate: ref.startDate ?? null,
        endDate: ref.endDate ?? null,
        type: ref.type ?? 'Proyecto',
      });
      dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'above', referenceId } });
      setSelectedRowId(newProject.id);
    }
  }, [state.projects, createProjectDraft, dispatch, setSelectedRowId]);

  const handleAddBelow = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (ref) {
      const order = state.projectOrder.length > 0 ? state.projectOrder : state.projects.map((p) => p.id);
      const descendants = new Set<string>();
      const queue: string[] = [referenceId];
      while (queue.length > 0) {
        const parentId = queue.shift() as string;
        for (const project of state.projects) {
          if (project.parentId === parentId && !descendants.has(project.id)) {
            descendants.add(project.id);
            queue.push(project.id);
          }
        }
      }
      let insertAfterId = referenceId;
      let maxIdx = order.indexOf(referenceId);
      for (const id of descendants) {
        const idx = order.indexOf(id);
        if (idx > maxIdx) {
          maxIdx = idx;
          insertAfterId = id;
        }
      }

      const newProject = createProjectDraft({
        hierarchyLevel: ref.hierarchyLevel || 0,
        parentId: ref.parentId,
        branch: Array.isArray(ref.branch) ? [...ref.branch] : [],
        startDate: ref.startDate ?? null,
        endDate: ref.endDate ?? null,
        type: ref.type ?? 'Proyecto',
      });
      dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'below', referenceId: insertAfterId } });
      setSelectedRowId(newProject.id);
    }
  }, [state.projects, state.projectOrder, createProjectDraft, dispatch, setSelectedRowId]);

  const handleAddInside = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (ref) {
      const newProject = createProjectDraft({
        hierarchyLevel: (ref.hierarchyLevel || 0) + 1,
        parentId: referenceId,
      });
      dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'inside', referenceId } });
    }
  }, [state.projects, createProjectDraft, dispatch]);

  const handleAddGroupAbove = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (!ref) return;
    const newProject = createProjectDraft({
      name: 'Nuevo grupo',
      hierarchyLevel: ref.hierarchyLevel || 0,
      parentId: ref.parentId,
      branch: Array.isArray(ref.branch) ? [...ref.branch] : [],
      startDate: ref.startDate ?? null,
      endDate: ref.endDate ?? null,
      type: ref.type ?? 'Proyecto',
      isExpanded: true,
    });
    dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'above', referenceId } });
    setSelectedRowId(newProject.id);
  }, [state.projects, createProjectDraft, dispatch, setSelectedRowId]);

  const handleAddGroupBelow = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (!ref) return;
    const newProject = createProjectDraft({
      name: 'Nuevo grupo',
      hierarchyLevel: ref.hierarchyLevel || 0,
      parentId: ref.parentId,
      branch: Array.isArray(ref.branch) ? [...ref.branch] : [],
      startDate: ref.startDate ?? null,
      endDate: ref.endDate ?? null,
      type: ref.type ?? 'Proyecto',
      isExpanded: true,
    });
    dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'below', referenceId } });
    setSelectedRowId(newProject.id);
  }, [state.projects, createProjectDraft, dispatch, setSelectedRowId]);

  const handleDuplicateRow = useCallback((referenceId: string) => {
    const ref = state.projects.find((p) => p.id === referenceId);
    if (ref) {
      const newProject = createProjectDraft({
        ...ref,
        name: `${ref.name} (copia)`,
      });
      dispatch({ type: 'ADD_PROJECT', payload: { project: newProject, position: 'below', referenceId } });
    }
  }, [state.projects, createProjectDraft, dispatch]);

  const handleMoveToParent = useCallback((projectId: string, parentId: string | null) => {
    const updates = { parentId };
    dispatch({ type: 'UPDATE_PROJECT', payload: { id: projectId, updates } });
  }, [dispatch]);

  const handleExportExcel = useCallback(() => {
    exportToExcel(state.projects, 'proyectos.xlsx');
  }, [state.projects]);

  const handleCopyCSV = useCallback(() => {
    copyAsCSV(state.projects);
  }, [state.projects]);

  const handleColumnWidthsChange = useCallback(() => {}, []);
  const handleMoveCopyColumn = useCallback(() => {}, []);
  const handleNewColumn = useCallback(() => {}, []);
  const handleOpenComments = useCallback((_taskId: string) => {}, []);
  const handleAddComment = useCallback(async () => {}, []);
  const handleDeleteComment = useCallback(async (_commentId: string) => {}, []);

  return {
    // Basic CRUD
    handleUpdate,
    handleDelete,
    handleToggleExpand,
    
    // Branch operations
    handleAddBranchOption,
    handleRenameBranchOption,
    handleDeleteBranchOption,
    handleMergeBranchOptions,
    
    // Person operations
    handleAddPersonOption,
    handleRenamePersonGlobal,
    handleDeletePersonGlobal,
    handleMergePersonsGlobal,
    handleSetPersonAvatar,
    
    // Selection
    handleToggleChecked,
    handleRowSelect,
    
    // Creation
    handleAddProject,
    createProjectDraft,
    handleAddAbove,
    handleAddBelow,
    handleAddGroupAbove,
    handleAddGroupBelow,
    handleAddInside,
    handleDuplicateRow,
    handleMoveToParent,
    handleExportExcel,
    handleCopyCSV,
    handleColumnWidthsChange,
    handleMoveCopyColumn,
    handleNewColumn,
    handleOpenComments,
    handleAddComment,
    handleDeleteComment,
    
    // Bulk operations
    handleSelectAll: useCallback((renderedProjectIds: string[]) => {
      renderedProjectIds.forEach(id => {
        setSelectedRowIds(prev => new Set(prev).add(id));
      });
    }, [setSelectedRowIds]),
    
    handleBulkIndent: useCallback(async (selectedIds: string[]) => {
      selectedIds.forEach(id => {
        const project = state.projects.find(p => p.id === id);
        if (project) {
          const parent = state.projects.find(p => p.id === project.parentId);
          if (parent) {
            dispatch({ 
              type: 'UPDATE_PROJECT', 
              payload: { 
                id, 
                parentId: parent.parentId 
              } 
            });
          }
        }
      });
    }, [state.projects, dispatch]),
    
    handleBulkOutdent: useCallback(async (selectedIds: string[]) => {
      selectedIds.forEach(id => {
        const project = state.projects.find(p => p.id === id);
        if (project && project.parentId) {
          const parent = state.projects.find(p => p.id === project.parentId);
          const grandParent = state.projects.find(p => p.id === parent?.parentId);
          if (grandParent) {
            dispatch({ 
              type: 'UPDATE_PROJECT', 
              payload: { 
                id, 
                parentId: grandParent.id 
              } 
            });
          }
        }
      });
    }, [state.projects, dispatch]),
    
    handleBulkDuplicate: useCallback((selectedIds: string[]) => {
      selectedIds.forEach(id => {
        handleDuplicateRow(id);
      });
    }, [handleDuplicateRow]),
    
    handleBulkDelete: useCallback(async (selectedIds: string[]) => {
      // TODO: Implementar confirmación para eliminación masiva
      selectedIds.forEach(id => {
        dispatch({ type: 'DELETE_PROJECT', payload: id });
      });
      setSelectedRowIds(new Set());
    }, [dispatch, setSelectedRowIds]),
  };
}

