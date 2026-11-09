import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { exportBackup, importBackup } from '@/lib/backup';
import { DEFAULT_REMINDERS, applyReminders, ensurePermission, type Reminder } from '@/lib/reminders';
import { Button, Card, Divider, Row, Screen, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

const WEEKDAYS = ['', 'вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export default function Settings() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { reloadProfile } = useApp();
  const [rem, setRem] = useState<Reminder[]>(DEFAULT_REMINDERS);

  useEffect(() => {
    getSetting<Reminder[]>(db, 'reminders', DEFAULT_REMINDERS).then((saved) =>
      setRem(DEFAULT_REMINDERS.map((d) => ({ ...d, ...saved.find((s) => s.id === d.id) }))),
    );
  }, [db]);

  const update = async (next: Reminder[]) => {
    if (next.some((r) => r.enabled) && !(await ensurePermission())) {
      Alert.alert('Уведомления выключены', 'Разрешите уведомления для «Калорий» в настройках iPhone.');
      return;
    }
    setRem(next);
    await setSetting(db, 'reminders', next);
    await applyReminders(next);
  };

  const backup = async () => {
    try {
      await exportBackup(db);
    } catch (e) {
      Alert.alert('Ошибка', String(e instanceof Error ? e.message : e));
    }
  };

  const restore = () =>
    Alert.alert('Восстановить из копии?', 'Все текущие записи будут заменены данными из файла.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выбрать файл',
        style: 'destructive',
        onPress: async () => {
          try {
            const n = await importBackup(db);
            if (n == null) return;
            await reloadProfile();
            const saved = await getSetting<Reminder[]>(db, 'reminders', DEFAULT_REMINDERS);
            const merged = DEFAULT_REMINDERS.map((d) => ({ ...d, ...saved.find((s) => s.id === d.id) }));
            setRem(merged);
            await applyReminders(merged);
            Alert.alert('Готово', `Восстановлено записей: ${n}`);
          } catch (e) {
            Alert.alert('Не удалось восстановить', String(e instanceof Error ? e.message : e));
          }
        },
      },
    ]);

  return (
    <Screen>
      <T weight="700">Напоминания</T>
      <Card>
        {rem.map((r, i) => (
          <View key={r.id} style={{ gap: 6 }}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T>{r.title}</T>
                <T dim size={12}>
                  {r.weekday != null ? `раз в неделю, ${WEEKDAYS[r.weekday]}` : 'каждый день'}
                </T>
              </View>
              {r.enabled && (
                <DateTimePicker
                  value={new Date(2000, 0, 1, r.hour, r.minute)}
                  mode="time"
                  display="compact"
                  locale="ru-RU"
                  onChange={(_, d) => d && update(rem.map((x) => (x.id === r.id ? { ...x, hour: d.getHours(), minute: d.getMinutes() } : x)))}
                />
              )}
              <Switch
                value={r.enabled}
                trackColor={{ true: t.accent }}
                onValueChange={(v) => update(rem.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))}
              />
            </Row>
          </View>
        ))}
      </Card>

      <T weight="700" style={{ marginTop: space.s }}>
        Резервная копия
      </T>
      <Card>
        <T dim size={13}>
          Данные хранятся только на телефоне. Если удалить приложение, они пропадут — сохраняйте копию в «Файлы» или
          отправляйте себе в мессенджер.
        </T>
        <Button title="Сохранить копию (JSON)" kind="secondary" onPress={backup} />
        <Button title="Восстановить из файла" kind="ghost" onPress={restore} />
      </Card>
      <T dim size={12} center>
        Калории 1.0 · данные о продуктах: Open Food Facts, лицензия ODbL
      </T>
    </Screen>
  );
}
