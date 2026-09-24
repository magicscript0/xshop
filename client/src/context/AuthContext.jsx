import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthContext from './AuthContextValue';
import { authService } from '../services/authService';
import { profileService } from '../services/profileService';
import { isSupabaseConfigured, supabase } from '../lib/supabase/client';

export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileOwnerId, setProfileOwnerId] = useState(null);
  const [profileStatus, setProfileStatus] = useState('idle');

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setStatus('unauthenticated');
      return undefined;
    }

    let active = true;
    let receivedAuthEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      if (!active) return;
      setSession(nextSession ?? null);
      setStatus(nextSession?.user ? 'authenticated' : 'unauthenticated');
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || receivedAuthEvent) return;
      const restoredSession = error ? null : data.session;
      setSession(restoredSession);
      setStatus(restoredSession?.user ? 'authenticated' : 'unauthenticated');
    }).catch(() => {
      if (!active || receivedAuthEvent) return;
      setSession(null);
      setStatus('unauthenticated');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      setProfile(null);
      setProfileOwnerId(null);
      setProfileStatus('idle');
      return () => { active = false; };
    }

    setProfile(null);
    setProfileOwnerId(userId);
    setProfileStatus('loading');
    profileService.getProfile(userId)
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setProfileStatus(nextProfile ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!active) return;
        setProfile(null);
        setProfileStatus('unavailable');
      });

    return () => { active = false; };
  }, [userId]);

  const currentProfile = userId && profileOwnerId === userId ? profile : null;
  const currentProfileStatus = !userId
    ? 'idle'
    : profileOwnerId === userId
      ? profileStatus
      : 'loading';

  const updateProfile = useCallback(async (changes) => {
    if (!userId) throw new Error('You must be signed in to update your profile.');
    const nextProfile = await profileService.updateOwnProfile(userId, changes);
    setProfile(nextProfile);
    setProfileOwnerId(userId);
    setProfileStatus('ready');
    return nextProfile;
  }, [userId]);

  const value = useMemo(() => ({
    status,
    session,
    user: session?.user ?? null,
    profile: currentProfile,
    profileStatus: currentProfileStatus,
    isConfigured: isSupabaseConfigured,
    signUp: authService.signUp,
    signInWithPassword: authService.signInWithPassword,
    signInWithGoogle: authService.signInWithGoogle,
    signOut: authService.signOut,
    resendVerification: authService.resendVerification,
    requestPasswordReset: authService.requestPasswordReset,
    updatePassword: authService.updatePassword,
    updateProfile,
  }), [status, session, currentProfile, currentProfileStatus, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
