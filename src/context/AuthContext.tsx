import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateAvatar: (file: File) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isConfigured: isSupabaseConfigured,
      signInWithGoogle: async () => {
        if (!supabase) return;
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
      updateAvatar: async (file: File) => {
        if (!supabase || !session?.user) return;

        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${session.user.id}/avatar-${Date.now()}.${ext}`;
        const bucket = 'avatars';

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
        const avatarUrl = publicUrlData.publicUrl;

        const { error: profileError } = await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
          .eq('id', session.user.id);
        if (profileError) throw profileError;

        const { error: authError } = await supabase.auth.updateUser({
          data: { avatar_url: avatarUrl },
        });
        if (authError) throw authError;

        const { data } = await supabase.auth.getSession();
        setSession(data.session ?? null);
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
