import { useCallback, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  activitiesForDate,
  addWater,
  clearMeal,
  copyMeal,
  currentWeight,
  entriesForDate,
  measurementsForDate,
  removeLastWater,
  setMeasurement,
  waterForDate,
  type ActivityRow,
  type Entry,
  type MeasurementRow,
} from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { WEEKDAYS_SHORT, addDays, fromKey, relativeDayTitle, todayKey, weekStart } from '@/lib/dates';
import { measurementDef } from '@/lib/measurements';
import { MEALS, fmt, macroGrams, round1, type MealType } from '@/lib/nutrition';
import { CalendarModal } from '@/ui/calendar';
import { Bar, Card, Divider, IconButton, ListItem, Plus, Ring, Row, Screen, Stepper, T } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

interface DayData {
  entries: Entry[];
  water: number;
  activities: ActivityRow[];
  measurements: MeasurementRow[];
  weight: number;
}

export default function Diary() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { date, setDate } = useApp();
  const [data, setData] = useState<DayData | null>(null);
  const [calendar, setCalendar] = useState(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    const my = ++req.current;
    const [entries, water, activities, measurements, weight] = await Promise.all([
      entriesForDate(db, date),
      waterForDate(db, date),
      activitiesForDate(db, date),
      measurementsForDate(db, date),
      currentWeight(db, profile, date),
    ]);
    if (my === req.current) setData({ entries, water, activities, measurements, weight });
  }, [db, date, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const eaten = sum(data?.entries ?? [], 'kcal');
  const burned = (data?.activities ?? []).reduce((a, x) => a + x.kcal, 0);
  const goal = profile.kcal_goal;
  const left = goal - eaten + burned;
  const macros = macroGrams(goal + burned, profile.protein_pct, profile.fat_pct, profile.carbs_pct);

  const mealMenu = (meal: MealType, title: string) => {
    const today = todayKey();
    const actions: { label: string; run: () => Promise<unknown>; destructive?: boolean }[] = [];
    if (date !== today) actions.push({ label: 'Скопировать на сегодня', run: () => copyMeal(db, date, meal, today) });
    actions.push({ label: 'Скопировать на завтра', run: () => copyMeal(db, date, meal, addDays(date, 1)) });
    actions.push({ label: 'Скопировать вчерашний сюда', run: () => copyMeal(db, addDays(date, -1), meal, date) });
    actions.push({ label: 'Очистить', run: () => clearMeal(db, date, meal), destructive: true });
    const run = async (i: number) => {
      const a = actions[i];
      if (!a) return;
      const n = await a.run();
      if (typeof n === 'number' && n === 0) Alert.alert('Нечего копировать', 'В этом приёме пищи нет записей.');
      load();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...actions.map((a) => a.label), 'Отмена'],
          cancelButtonIndex: actions.length,
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
        },
        (i) => run(i),
      );
    } else {
      Alert.alert(title, undefined, [...actions.map((a, i) => ({ text: a.label, onPress: () => run(i) })), { text: 'Отмена', style: 'cancel' }]);
    }
  };

  const changeWeight = async (delta: number) => {
    if (!data) return;
    const v = round1(data.weight + delta);
    await setMeasurement(db, date, 'weight', v);
    load();
  };

  const weekFrom = weekStart(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const loggedWeight = data?.measurements.find((m) => m.type === 'weight');
  const otherMeasurements = (data?.measurements ?? []).filter((m) => m.type !== 'weight');
  const glasses = Math.max(Math.ceil(profile.water_goal_ml / profile.glass_ml), 1);
  const filled = Math.floor((data?.water ?? 0) / profile.glass_ml);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.s }}>
        <IconButton label="‹" onPress={() => setDate(addDays(date, -1))} />
        <Pressable onPress={() => setCalendar(true)} hitSlop={10}>
          <T size={20} weight="700">
            {relativeDayTitle(date)} ▾
          </T>
        </Pressable>
        <IconButton label="›" onPress={() => setDate(addDays(date, 1))} />
      </Row>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.l, paddingTop: space.s, gap: 4 }}>
        {week.map((d, i) => {
          const sel = d === date;
          return (
            <Pressable key={d} onPress={() => setDate(d)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.m, backgroundColor: sel ? t.accent : 'transparent' }}>
              <T size={11} color={sel ? t.onAccent : t.textDim}>
                {WEEKDAYS_SHORT[i]}
              </T>
              <T size={15} weight={d === todayKey() ? '800' : '500'} color={sel ? t.onAccent : t.text}>
                {fromKey(d).getDate()}
              </T>
            </Pressable>
          );
        })}
      </View>

      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Съедено" value={eaten} />
            <Ring value={eaten} max={goal + burned} size={140}>
              <T size={28} weight="800" color={left < 0 ? t.danger : t.text}>
                {fmt(Math.abs(left))}
              </T>
              <T dim size={12}>
                {left < 0 ? 'ккал сверх' : 'ккал осталось'}
              </T>
            </Ring>
            <Stat label="Сожжено" value={burned} />
          </Row>
          <Row gap={space.m} style={{ marginTop: space.s }}>
            <MacroBar label="Белки" value={sum(data?.entries ?? [], 'protein')} goal={macros.protein} color={t.protein} />
            <MacroBar label="Жиры" value={sum(data?.entries ?? [], 'fat')} goal={macros.fat} color={t.fat} />
            <MacroBar label="Углеводы" value={sum(data?.entries ?? [], 'carbs')} goal={macros.carbs} color={t.carbs} />
          </Row>
        </Card>

        {MEALS.map((m) => {
          const items = (data?.entries ?? []).filter((e) => e.meal_type === m.type);
          const kcal = sum(items, 'kcal');
          return (
            <Card key={m.type}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable onPress={() => mealMenu(m.type, m.title)} style={{ flex: 1 }} hitSlop={6}>
                  <T size={17} weight="700">
                    {m.title}
                  </T>
                  <T dim size={13}>
                    {items.length ? `${fmt(kcal)} ккал · Б ${fmt(sum(items, 'protein'))} Ж ${fmt(sum(items, 'fat'))} У ${fmt(sum(items, 'carbs'))}` : 'Нет записей'}
                  </T>
                </Pressable>
                <IconButton label="⋯" onPress={() => mealMenu(m.type, m.title)} color={t.textDim} />
                <Plus onPress={() => router.push({ pathname: '/add-food', params: { meal: m.type } })} />
              </Row>
              {items.length > 0 && <Divider />}
              {items.map((e) => (
                <ListItem
                  key={e.id}
                  title={e.name}
                  subtitle={e.grams != null ? `${fmt(e.grams)} г${e.serving_label ? ` · ${e.serving_label}` : ''}` : 'быстрое добавление'}
                  right={<T dim>{fmt(e.kcal)} ккал</T>}
                  onPress={() => router.push({ pathname: '/entry/[id]', params: { id: e.id } })}
                />
              ))}
            </Card>
          );
        })}

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T size={17} weight="700">
                Вода
              </T>
              <T dim size={13}>
                {fmt((data?.water ?? 0) / 1000, 2)} из {fmt(profile.water_goal_ml / 1000, 2)} л
              </T>
            </View>
            <Stepper
              onMinus={async () => {
                await removeLastWater(db, date);
                load();
              }}
              onPlus={async () => {
                await addWater(db, date, profile.glass_ml);
                load();
              }}
            >
              <T weight="600">{profile.glass_ml} мл</T>
            </Stepper>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: Math.max(glasses, filled) }, (_, i) => (
              <View
                key={i}
                style={{ width: 22, height: 28, borderRadius: 5, borderWidth: 2, borderColor: t.water, backgroundColor: i < filled ? t.water : 'transparent' }}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T size={17} weight="700">
                Активность
              </T>
              <T dim size={13}>
                {burned ? `${fmt(burned)} ккал` : 'Нет записей'}
              </T>
            </View>
            <Plus onPress={() => router.push('/activity')} />
          </Row>
          {(data?.activities ?? []).map((a) => (
            <ListItem
              key={a.id}
              title={a.name}
              subtitle={`${a.minutes} мин`}
              right={<T dim>{fmt(a.kcal)} ккал</T>}
              onLongPress={() => router.push('/activity')}
            />
          ))}
        </Card>

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T size={17} weight="700">
                Замеры
              </T>
              <T dim size={13}>
                {loggedWeight ? 'Вес записан' : 'Вес за этот день не записан'}
              </T>
            </View>
            <Stepper onMinus={() => changeWeight(-0.1)} onPlus={() => changeWeight(0.1)}>
              <T size={18} weight="700" color={loggedWeight ? t.text : t.textDim}>
                {fmt(data?.weight ?? 0, 1)} кг
              </T>
            </Stepper>
          </Row>
          {otherMeasurements.map((m) => {
            const def = measurementDef(m.type);
            return <ListItem key={m.id} title={def.title} right={<T dim>{`${fmt(m.value, 1)} ${def.unit}`}</T>} />;
          })}
          <Pressable onPress={() => router.push('/measurements')} hitSlop={6}>
            <T color={t.accent} weight="600">
              {otherMeasurements.length ? 'Изменить замеры' : 'Добавить замеры тела'}
            </T>
          </Pressable>
        </Card>
      </Screen>

      <CalendarModal
        visible={calendar}
        value={date}
        onClose={() => setCalendar(false)}
        onPick={(d) => {
          setDate(d);
          setCalendar(false);
        }}
      />
    </SafeAreaView>
  );
}

const sum = (rows: Entry[], k: 'kcal' | 'protein' | 'fat' | 'carbs') => rows.reduce((a, r) => a + (r[k] ?? 0), 0);

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center', width: 70 }}>
      <T size={20} weight="700">
        {fmt(value)}
      </T>
      <T dim size={12}>
        {label}
      </T>
    </View>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T size={13} weight="600">
        {label}
      </T>
      <Bar value={value} max={goal} color={color} />
      <T dim size={12}>
        {fmt(value)} / {fmt(goal)} г
      </T>
    </View>
  );
}
