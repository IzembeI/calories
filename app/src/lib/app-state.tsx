import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getProfile, getSetting, type Profile } from '@/db/repo';
import { ToastHost, type ToastMsg } from '@/ui/components';
import { setDayStartHour, todayKey } from './dates';
import { setHapticsEnabled } from './haptics';
import { setMealTitles } from './nutrition';
import { setDietBreak, setKcalSchedule, type DietBreak, type KcalSchedule } from './schedule';

interface AppState {
  profile: Profile | null;
  loaded: boolean;
  reloadProfile: () => Promise<void>;
  /** Selected diary day, shared by the diary and the screens it opens. */
  date: string;
  setDate: (d: string) => void;
  /** Bottom toast for ~4 s; `action` (e.g. «Отменить») runs once, then the diary reloads. */
  showToast: (m: ToastMsg) => void;
  /** Bumped when data changed outside the focused screen (an undo); the diary reloads on it. */
  diaryVersion: number;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [toast, setToast] = useState<(ToastMsg & { key: number }) | null>(null);
  const [diaryVersion, setDiaryVersion] = useState(0);
  const toastKey = useRef(0);

  const showToast = useCallback((m: ToastMsg) => setToast({ ...m, key: ++toastKey.current }), []);
  const hideToast = useCallback(() => setToast(null), []);
  const runToastAction = useCallback(async (run: () => Promise<unknown> | void) => {
    setToast(null);
    try {
      await run();
    } catch (e) {
      Alert.alert('Не получилось отменить', String(e instanceof Error ? e.message : e));
    } finally {
      setDiaryVersion((v) => v + 1);
    }
  }, []);

  const lastToday = useRef(todayKey());
  const reloadProfile = useCallback(async () => {
    // «Начало дня» moves the boundary of today; apply it before anything reads todayKey()
    const before = todayKey();
    setDayStartHour(await getSetting<number>(db, 'day_start_hour', 0));
    setHapticsEnabled((await getSetting<boolean>(db, 'haptics', true)) !== false);
    setDietBreak(await getSetting<DietBreak | null>(db, 'diet_break', null));
    setMealTitles(await getSetting<Record<string, string> | null>(db, 'meal_titles', null));
    setKcalSchedule(await getSetting<KcalSchedule | null>(db, 'kcal_schedule', null));
    const after = todayKey();
    lastToday.current = after;
    if (after !== before) setDate((d) => (d === before ? after : d));
    setProfile(await getProfile(db));
    setLoaded(true);
  }, [db]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  // If the app stays open past midnight and the diary still shows the old "today", move it to the new day.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const now = todayKey();
      if (now !== lastToday.current) {
        const prev = lastToday.current;
        lastToday.current = now;
        setDate((d) => (d === prev ? now : d));
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <Ctx.Provider value={{ profile, loaded, reloadProfile, date, setDate, showToast, diaryVersion }}>
      {children}
      <ToastHost msg={toast} onHide={hideToast} onAction={runToastAction} />
    </Ctx.Provider>
  );
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
