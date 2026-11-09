import * as Notifications from 'expo-notifications';

export interface Reminder {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
  hour: number;
  minute: number;
  /** 1 = Sunday … 7 = Saturday (iOS calendar), only for weekly */
  weekday?: number;
}

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'breakfast', title: 'Завтрак', body: 'Не забудьте записать завтрак', enabled: false, hour: 9, minute: 0 },
  { id: 'lunch', title: 'Обед', body: 'Запишите, что было на обед', enabled: false, hour: 13, minute: 30 },
  { id: 'dinner', title: 'Ужин', body: 'Запишите ужин', enabled: false, hour: 19, minute: 30 },
  { id: 'water', title: 'Вода', body: 'Пора выпить стакан воды', enabled: false, hour: 16, minute: 0 },
  { id: 'measure', title: 'Замеры', body: 'Время еженедельных замеров: вес и объёмы', enabled: false, hour: 8, minute: 0, weekday: 2 },
];

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/** Re-create all scheduled notifications from the list. */
export async function applyReminders(list: Reminder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of list) {
    if (!r.enabled) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger:
        r.weekday != null
          ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weekday, hour: r.hour, minute: r.minute }
          : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute },
    });
  }
}
