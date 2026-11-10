import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { setDayStartHour } from '@/lib/dates';
import { setHapticsEnabled } from '@/lib/haptics';
import { autoBackup, exportBackup, importBackup } from '@/lib/backup';
import { DEFAULT_REMINDERS, applyReminders, ensurePermission, type Reminder } from '@/lib/reminders';
import { type WeighHint } from '@/lib/trend';
import { Button, Card, Divider, Row, Screen, Segmented, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

const WEEKDAYS = ['', 'вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export default function Settings() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { reloadProfile } = useApp();
  const [rem, setRem] = useState<Reminder[]>(DEFAULT_REMINDERS);
  const [weighHint, setWeighHint] = useState<WeighHint>('daily');
  const [proteinHint, setProteinHint] = useState(true);
  const [autoOn, setAutoOn] = useState(true);
  const [dayStart, setDayStart] = useState('0');
  const [gameOn, setGameOn] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [lastAuto, setLastAuto] = useState<string | null>(null);

  useEffect(() => {
    getSetting<Reminder[]>(db, 'reminders', DEFAULT_REMINDERS).then((saved) =>
      setRem(DEFAULT_REMINDERS.map((d) => ({ ...d, ...saved.find((s) => s.id === d.id) }))),
    );
    getSetting<WeighHint>(db, 'weigh_hint', 'daily').then((h) => setWeighHint(h === 'weekly' ? 'weekly' : 'daily'));
    getSetting<boolean>(db, 'protein_hint', true).then((v) => setProteinHint(v !== false));
    getSetting<number>(db, 'day_start_hour', 0).then((h) => setDayStart(String(h)));
    getSetting<boolean>(db, 'haptics', true).then((v) => setHaptics(v !== false));
    getSetting<boolean>(db, 'game_card', true).then((v) => setGameOn(v !== false));
    getSetting<boolean>(db, 'auto_backup', true).then((v) => setAutoOn(v !== false));
    getSetting<string | null>(db, 'last_auto_backup', null).then(setLastAuto);
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
        Взвешивания
      </T>
      <Card>
        <Segmented
          options={[
            { value: 'daily', title: 'Каждый день' },
            { value: 'weekly', title: 'Раз в неделю' },
          ]}
          value={weighHint}
          onChange={(v) => {
            setWeighHint(v);
            setSetting(db, 'weigh_hint', v);
          }}
        />
        <T dim size={12}>
          Подсказка на вкладке «Прогресс». Темп веса считается по тренду, если за 2 недели есть 4 взвешивания.
        </T>
      </Card>

      <T weight="700" style={{ marginTop: space.s }}>
        Дневник
      </T>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Белок в приёмах пищи</T>
            <T dim size={12}>
              Серая пометка, если в завтраке, обеде или ужине меньше 20 г белка. Перекусы не отмечаются.
            </T>
          </View>
          <Switch
            value={proteinHint}
            onValueChange={(v) => {
              setProteinHint(v);
              setSetting(db, 'protein_hint', v);
            }}
            trackColor={{ true: t.accent }}
          />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Росток и серия дней</T>
            <T dim size={12}>
              Карточка с уровнем и серией в дневнике. Выключите, если она отвлекает: записи и очки никуда не денутся.
            </T>
          </View>
          <Switch
            value={gameOn}
            onValueChange={(v) => {
              setGameOn(v);
              setSetting(db, 'game_card', v);
            }}
            trackColor={{ true: t.accent }}
          />
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Вибрация</T>
            <T dim size={12}>
              Лёгкий отклик, когда еда добавлена или штрихкод найден.
            </T>
          </View>
          <Switch
            value={haptics}
            onValueChange={(v) => {
              setHaptics(v);
              setHapticsEnabled(v);
              setSetting(db, 'haptics', v);
            }}
            trackColor={{ true: t.accent }}
          />
        </Row>
        <Divider />
        <T>Начало дня</T>
        <Segmented
          options={[
            { value: '0', title: '00:00' },
            { value: '3', title: '03:00' },
            { value: '4', title: '04:00' },
            { value: '5', title: '05:00' },
          ]}
          value={dayStart}
          onChange={async (v) => {
            setDayStart(v);
            await setSetting(db, 'day_start_hour', Number(v));
            setDayStartHour(Number(v));
            await reloadProfile(); // moves the open diary if «сегодня» has just changed
          }}
        />
        <T dim size={12}>
          Для тех, кто ложится поздно: если день начинается в 04:00, перекус в 01:30 запишется во вчерашний день.
        </T>
      </Card>

      <T weight="700" style={{ marginTop: space.s }}>
        Резервная копия
      </T>
      <Card>
        <T dim size={13}>
          Данные хранятся только на телефоне. Если удалить приложение, они пропадут — сохраняйте копию в «Файлы» или
          отправляйте себе в мессенджер.
        </T>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Автокопия раз в неделю</T>
            <T dim size={12}>
              {lastAuto ? `Последняя: ${lastAuto.slice(8, 10)}.${lastAuto.slice(5, 7)}, ` : ''}папка «Файлы → На iPhone → Калории».
              Эти копии внутри приложения и удаляются вместе с ним — переносите их в iCloud Drive.
            </T>
          </View>
          <Switch
            value={autoOn}
            onValueChange={async (v) => {
              setAutoOn(v);
              await setSetting(db, 'auto_backup', v);
              if (!v) return;
              try {
                await autoBackup(db);
                setLastAuto(await getSetting<string | null>(db, 'last_auto_backup', null));
              } catch (e) {
                Alert.alert('Не удалось сохранить автокопию', String(e instanceof Error ? e.message : e));
              }
            }}
            trackColor={{ true: t.accent }}
          />
        </Row>
        <Button title="Сохранить копию (JSON)" kind="secondary" onPress={backup} />
        <Button title="Восстановить из файла" kind="ghost" onPress={restore} />
      </Card>
      <T dim size={12} center>
        Калории 1.0 · данные о продуктах: Open Food Facts, лицензия ODbL
      </T>
    </Screen>
  );
}
