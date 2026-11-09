import { useCallback, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { clearMeal, copyMeal, entriesForDate, type Entry } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { WEEKDAYS_SHORT, addDays, fromKey, relativeDayTitle, todayKey, weekStart } from '@/lib/dates';
import { dayMicros, microsScore, type Micros } from '@/lib/micros';
import { MEALS, fmt, macroGrams, type MealType } from '@/lib/nutrition';
import { CalendarModal } from '@/ui/calendar';
import { Bar, Card, Divider, IconButton, ListItem, Plus, Ring, Row, Screen, T } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

export default function Diary() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { date, setDate } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [micros, setMicros] = useState<Micros>({});
  const [calendar, setCalendar] = useState(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    const my = ++req.current;
    const [e, m] = await Promise.all([entriesForDate(db, date), dayMicros(db, date)]);
    if (my !== req.current) return; // a newer day was requested meanwhile
    setEntries(e);
    setMicros(m);
  }, [db, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const eaten = sum(entries, 'kcal');
  const goal = profile.kcal_goal;
  const left = goal - eaten;
  const macros = macroGrams(goal, profile.protein_pct, profile.fat_pct, profile.carbs_pct);
  const score = microsScore(micros);

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

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.s }}>
        <IconButton label="‹" a11y="Предыдущий день" onPress={() => setDate(addDays(date, -1))} />
        <Pressable onPress={() => setCalendar(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Выбрать дату">
          <T size={20} weight="700">
            {relativeDayTitle(date)} ▾
          </T>
        </Pressable>
        <IconButton label="›" a11y="Следующий день" onPress={() => setDate(addDays(date, 1))} />
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
            <Ring value={eaten} max={goal} size={140}>
              <T size={28} weight="800" color={left < 0 ? t.danger : t.text}>
                {fmt(Math.abs(left))}
              </T>
              <T dim size={12}>
                {left < 0 ? 'ккал сверх' : 'ккал осталось'}
              </T>
            </Ring>
            <Stat label="Норма" value={goal} />
          </Row>
          <Row gap={space.m} style={{ marginTop: space.s }}>
            <MacroBar label="Белки" value={sum(entries, 'protein')} goal={macros.protein} color={t.protein} />
            <MacroBar label="Жиры" value={sum(entries, 'fat')} goal={macros.fat} color={t.fat} />
            <MacroBar label="Углеводы" value={sum(entries, 'carbs')} goal={macros.carbs} color={t.carbs} />
          </Row>
        </Card>

        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal_type === m.type);
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
                <IconButton label="⋯" a11y={`Действия: ${m.title}`} onPress={() => mealMenu(m.type, m.title)} color={t.textDim} />
                <Plus a11y={`Добавить в ${m.title.toLowerCase()}`} onPress={() => router.push({ pathname: '/add-food', params: { meal: m.type } })} />
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

        <Card onPress={() => router.push({ pathname: '/nutrients', params: { from: date, to: date } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={17} weight="700">
              Витамины и минералы
            </T>
            <T dim>›</T>
          </Row>
          {entries.length === 0 ? (
            <T dim size={13}>
              Появятся, когда добавите еду.
            </T>
          ) : (
            <>
              <T dim size={13}>
                ≈ {score.ok} из {score.total} в норме · добавленный сахар {fmt(micros.added_sugar ?? 0)} г
              </T>
              <Bar value={score.ok} max={score.total} color={t.accent} />
            </>
          )}
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
