import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getProfile, type Profile } from '@/db/repo';
import { todayKey } from './dates';

interface AppState {
  profile: Profile | null;
  loaded: boolean;
  reloadProfile: () => Promise<void>;
  /** Selected diary day, shared by the diary and the screens it opens. */
  date: string;
  setDate: (d: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(todayKey());

  const reloadProfile = useCallback(async () => {
    setProfile(await getProfile(db));
    setLoaded(true);
  }, [db]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  return <Ctx.Provider value={{ profile, loaded, reloadProfile, date, setDate }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

/** Profile that is guaranteed to exist (screens behind onboarding). */
export function useProfile(): Profile {
  const { profile } = useApp();
  if (!profile) throw new Error('no profile');
  return profile;
}
