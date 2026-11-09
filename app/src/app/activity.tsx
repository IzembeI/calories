import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { activitiesForDate, addActivity, currentWeight, deleteActivity, type ActivityRow } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { fmt, parseNum } from '@/lib/nutrition';
import { Button, Card, Divider, Field, IconButton, ListItem, NumField, Row, Screen, T } from '@/ui/components';
import { radius, useTheme } from '@/ui/theme';
import { Pressable } from 'react-native';

// MET values (Compendium of Physical Activities, rounded)
const ACTIVITIES: { name: string; met: number }[] = [
  { name: 'Ходьба', met: 3.5 },
  { name: 'Быстрая ходьба', met: 4.8 },
  { name: 'Бег 8 км/ч', met: 8.3 },
  { name: 'Бег 10 км/ч', met: 9.8 },
  { name: 'Велосипед', met: 7.0 },
  { name: 'Силовая тренировка', met: 5.0 },
  { name: 'Плавание', met: 6.0 },
  { name: 'Йога', met: 2.5 },
  { name: 'Танцы', met: 5.0 },
  { name: 'Футбол', met: 7.0 },
  { name: 'Лыжи', met: 7.0 },
  { name: 'Уборка дома', met: 3.3 },
  { name: 'Эллипс', met: 5.0 },
  { name: 'Скакалка', met: 11.0 },
];

export default function Activity() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { date } = useApp();
  const [list, setList] = useState<ActivityRow[]>([]);
  const [weight, setWeight] = useState(profile.start_weight_kg);
  const [picked, setPicked] = useState<{ name: string; met: number } | null>(null);
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [kcal, setKcal] = useState('');

  const load = useCallback(async () => {
    setList(await activitiesForDate(db, date));
    setWeight(await currentWeight(db, profile, date));
  }, [db, date, profile]);
  useEffect(() => {
    load();
  }, [load]);

  const min = parseNum(minutes) ?? 0;
  const auto = picked ? (picked.met * 3.5 * weight * min) / 200 : 0;
  const kcalValue = parseNum(kcal) ?? Math.round(auto);
  const name = picked?.name ?? custom.trim();

  const add = async () => {
    if (!name || min <= 0 || kcalValue < 0) return;
    await addActivity(db, date, name, Math.round(min), kcalValue);
    setPicked(null);
    setCustom('');
    setKcal('');
    load();
  };

  return (
    <Screen>
      <T dim>{formatDay(date)}</T>
      {list.length > 0 && (
        <Card>
          {list.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <ListItem
                title={a.name}
                subtitle={`${a.minutes} мин`}
                right={
                  <Row>
                    <T dim>{fmt(a.kcal)} ккал</T>
                    <IconButton
                      label="✕"
                      color={t.danger}
                      onPress={() =>
                        Alert.alert('Удалить?', a.name, [
                          { text: 'Отмена', style: 'cancel' },
                          { text: 'Удалить', style: 'destructive', onPress: () => deleteActivity(db, a.id).then(load) },
                        ])
                      }
                    />
                  </Row>
                }
              />
            </View>
          ))}
        </Card>
      )}
      <T weight="700">Добавить</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ACTIVITIES.map((a) => (
          <Pressable
            key={a.name}
            onPress={() => {
              setPicked(a);
              setKcal('');
            }}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.m, backgroundColor: picked?.name === a.name ? t.accent : t.input }}
          >
            <T size={14} color={picked?.name === a.name ? t.onAccent : t.text}>
              {a.name}
            </T>
          </Pressable>
        ))}
      </View>
      {!picked && <Field label="Или своё название" value={custom} onChangeText={setCustom} placeholder="Например, теннис" />}
      <Row>
        <NumField style={{ flex: 1 }} label="Длительность" suffix="мин" value={minutes} onChangeText={setMinutes} />
        <NumField
          style={{ flex: 1 }}
          label="Сожжено"
          suffix="ккал"
          value={kcal}
          placeholder={picked ? String(Math.round(auto)) : '0'}
          onChangeText={setKcal}
        />
      </Row>
      {picked ? (
        <T dim size={12}>
          Оценка по MET для веса {fmt(weight, 1)} кг. Можно вписать своё значение, например с часов.
        </T>
      ) : null}
      <Button title="Добавить активность" onPress={add} disabled={!name || min <= 0} />
    </Screen>
  );
}
