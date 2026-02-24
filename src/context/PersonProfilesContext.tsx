import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { PersonProfilesMap, normalizePersonKey, PersonProfile } from '@/lib/personProfiles';

// ════════════════════════════════════════════════════
//  TYPES
// ════════════════════════════════════════════════════

export interface PersonProfilesState {
  profiles: PersonProfilesMap;
  loading: boolean;
  error: string | null;
}

export interface PersonProfilesContextType extends PersonProfilesState {
  // Actions
  updateProfile: (personName: string, updates: Partial<PersonProfile>) => Promise<void>;
  setAvatar: (personName: string, file: File) => Promise<void>;
  removeAvatar: (personName: string) => Promise<void>;
  deleteProfile: (personName: string) => Promise<void>;
  mergeProfiles: (fromName: string, toName: string, keepData: 'from' | 'to') => Promise<void>;
  renameProfile: (fromName: string, toName: string) => Promise<void>;
  
  // Utils
  getProfile: (personName: string) => PersonProfile | undefined;
  getAvatarUrl: (personName: string) => string | undefined;
  clearError: () => void;
  refreshProfiles: () => Promise<void>;
}

// ════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════

const STORAGE_KEY = 'person-profiles';
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ════════════════════════════════════════════════════
//  CONTEXT
// ════════════════════════════════════════════════════

const PersonProfilesContext = createContext<PersonProfilesContextType | null>(null);

// ════════════════════════════════════════════════════
//  PROVIDER
// ════════════════════════════════════════════════════

interface PersonProfilesProviderProps {
  children: React.ReactNode;
}

export function PersonProfilesProvider({ children }: PersonProfilesProviderProps) {
  const [state, setState] = useState<PersonProfilesState>({
    profiles: {},
    loading: false,
    error: null,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const loadProfiles = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setState(prev => ({
            ...prev,
            profiles: parsed,
          }));
        }
      } catch (error) {
        console.error('Error loading person profiles:', error);
      }
    };

    loadProfiles();
  }, []);

  // Save to localStorage whenever profiles change
  useEffect(() => {
    if (state.profiles && Object.keys(state.profiles).length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profiles));
      } catch (error) {
        console.error('Error saving person profiles:', error);
      }
    }
  }, [state.profiles]);

  // Clear error helper
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Set error helper
  const setError = useCallback((error: string) => {
    setState(prev => ({ ...prev, error, loading: false }));
  }, []);

  // Get profile helper
  const getProfile = useCallback((personName: string): PersonProfile | undefined => {
    const key = normalizePersonKey(personName);
    return state.profiles[key];
  }, [state.profiles]);

  // Get avatar URL helper
  const getAvatarUrl = useCallback((personName: string): string | undefined => {
    return getProfile(personName)?.avatarUrl;
  }, [getProfile]);

  // Refresh profiles
  const refreshProfiles = useCallback(async () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState(prev => ({
          ...prev,
          profiles: parsed,
        }));
      }
    } catch (error) {
      setError('Error al recargar perfiles');
    }
  }, [setError]);

  // Update profile
  const updateProfile = useCallback(async (personName: string, updates: Partial<PersonProfile>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const key = normalizePersonKey(personName);
      const currentProfile = state.profiles[key] || {};
      
      const updatedProfile: PersonProfile = {
        ...currentProfile,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      setState(prev => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [key]: updatedProfile,
        },
        loading: false,
      }));
    } catch (error) {
      setError('Error al actualizar perfil');
    }
  }, [state.profiles, setError]);

  // Set avatar
  const setAvatar = useCallback(async (personName: string, file: File) => {
    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Solo se permiten imágenes JPEG, PNG o WebP');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setError('La imagen no debe superar 5MB');
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Convert file to base64
      const avatarUrl = await fileToBase64(file);
      
      await updateProfile(personName, { avatarUrl });
    } catch (error) {
      setError('Error al procesar la imagen');
    }
  }, [updateProfile, setError]);

  // Remove avatar
  const removeAvatar = useCallback(async (personName: string) => {
    await updateProfile(personName, { avatarUrl: undefined });
  }, [updateProfile]);

  // Delete profile
  const deleteProfile = useCallback(async (personName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const key = normalizePersonKey(personName);
      
      setState(prev => {
        const newProfiles = { ...prev.profiles };
        delete newProfiles[key];
        
        return {
          ...prev,
          profiles: newProfiles,
          loading: false,
        };
      });
    } catch (error) {
      setError('Error al eliminar perfil');
    }
  }, [setError]);

  // Merge profiles
  const mergeProfiles = useCallback(async (
    fromName: string, 
    toName: string, 
    keepData: 'from' | 'to'
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const fromKey = normalizePersonKey(fromName);
      const toKey = normalizePersonKey(toName);
      
      const fromProfile = state.profiles[fromKey] || {};
      const toProfile = state.profiles[toKey] || {};
      
      // Decide which data to keep
      const keptProfile = keepData === 'from' ? fromProfile : toProfile;
      const finalProfile = {
        ...keptProfile,
        updatedAt: new Date().toISOString(),
      };

      setState(prev => {
        const newProfiles = { ...prev.profiles };
        
        // Remove old profiles
        delete newProfiles[fromKey];
        delete newProfiles[toKey];
        
        // Add merged profile with new key
        const finalKey = normalizePersonKey(keepData === 'from' ? fromName : toName);
        newProfiles[finalKey] = finalProfile;
        
        return {
          ...prev,
          profiles: newProfiles,
          loading: false,
        };
      });
    } catch (error) {
      setError('Error al fusionar perfiles');
    }
  }, [state.profiles, setError]);

  // Rename profile
  const renameProfile = useCallback(async (fromName: string, toName: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const fromKey = normalizePersonKey(fromName);
      const toKey = normalizePersonKey(toName);
      
      const profile = state.profiles[fromKey];
      
      if (!profile) {
        setError('Perfil no encontrado');
        return;
      }

      setState(prev => {
        const newProfiles = { ...prev.profiles };
        
        // Remove old key
        delete newProfiles[fromKey];
        
        // Add with new key
        newProfiles[toKey] = {
          ...profile,
          updatedAt: new Date().toISOString(),
        };
        
        return {
          ...prev,
          profiles: newProfiles,
          loading: false,
        };
      });
    } catch (error) {
      setError('Error al renombrar perfil');
    }
  }, [state.profiles, setError]);

  // Context value
  const value = useMemo<PersonProfilesContextType>(() => ({
    ...state,
    updateProfile,
    setAvatar,
    removeAvatar,
    deleteProfile,
    mergeProfiles,
    renameProfile,
    getProfile,
    getAvatarUrl,
    clearError,
    refreshProfiles,
  }), [state, updateProfile, setAvatar, removeAvatar, deleteProfile, mergeProfiles, renameProfile, getProfile, getAvatarUrl, clearError, refreshProfiles]);

  return (
    <PersonProfilesContext.Provider value={value}>
      {children}
    </PersonProfilesContext.Provider>
  );
}

// ════════════════════════════════════════════════════
//  HOOK
// ════════════════════════════════════════════════════

export function usePersonProfiles() {
  const context = useContext(PersonProfilesContext);
  
  if (!context) {
    throw new Error('usePersonProfiles must be used within a PersonProfilesProvider');
  }
  
  return context;
}

// ════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
