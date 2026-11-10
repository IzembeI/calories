import { useCallback, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { clearMeal, copyMeal, currentWeight, entriesForDate, getSetting, measurementsForDate, setMeasurement, type Entry } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { WEEKDAYS_SHORT, addDays, fromKey, relativeDayTitle, todayKey, weekStart } from '@/lib/dates';
import { NUTRIENTS, dayFiberExact, dayMicros, dvFor, microsScore, type Micros } from '@/lib/micros';
import { MEALS, PROTEIN_MEAL_MIN_G, fmt, macroTargets, parseNum, type MealType } from '@/lib/nutrition';
import { BackupNudge } from '@/ui/backup-nudge';
import { CalendarModal } from '@/ui/calendar';
import { Bar, Button, Card, Divider, IconButton, ListItem, NumField, Plus, Ring, Row, Screen, T } from '@/ui/components';
import { artFor, FoodPic, Icon, MEAL_ART } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

export default function Diary() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { date, setDate, diaryVersion } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [micros, setMicros] = useState<Micros>({});
  const [calendar, setCalendar] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [weighing, setWeighing] = useState(false);
  const [trendW, setTrendW] = useState<number | undefined>(undefined);
  const [proteinHint, setProteinHint] = useState(true);
  const [fiberExact, setFiberExact] = useState(false);
  const req = useRef(0);

  const load = useCallback(async () => {
    void diaryVersion; // an undo from the toast bumps it, so the open diary reloads
    const my = ++req.current;
    const [e, m, ms, tw, ph, fx] = await Promise.all([
      entriesForDate(db, date),
      dayMicros(db, date),
      measurementsForDate(db, date),
      currentWeight(db, profile, date),
      getSetting<boolean>(db, 'protein_hint', true),
      dayFiberExact(db, date),
    ]);
    if (my !== req.current) return; // a newer day was requested meanwhile
    setEntries(e);
    setFiberExact(fx);
    setTrendW(tw);
    setProteinHint(ph !== false);
    setMicros(m);
    setWeight(ms.find((x) => x.type === 'weight')?.value ?? null);
  }, [db, date, profile, diaryVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const eaten = sum(entries, 'kcal');
  const goal = profile.kcal_goal;
  const left = goal - eaten;
  const macros = macroTargets(profile, trendW);
  // Main meals only: snacks are small by design, so they are not marked.
  const mainMeals = MEALS.filter((m) => m.type !== 'snack');
  const proteinMeals = mainMeals.filter((m) => sum(entries.filter((e) => e.meal_type === m.type), 'protein') >= PROTEIN_MEAL_MIN_G).length;
  const normP = { ...profile, weight_kg: trendW };
  const score = microsScore(micros, normP);
  const fiber = micros.fiber ?? 0;
  const fiberDv = dvFor(NUTRIENTS.find((d) => d.key === 'fiber')!, normP);

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
        <BackupNudge />
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Съедено" value={eaten} />
            {/* Over the goal nothing turns red: the number stays neutral and the label calmly says so */}
            <Ring value={eaten} max={goal} size={140}>
              <View
                accessible
                accessibilityLabel={left < 0 ? `Сверх нормы на ${fmt(-left)} ккал` : `Осталось ${fmt(left)} ккал`}
                style={{ alignItems: 'center' }}
              >
                <T size={28} weight="800">
                  {fmt(Math.abs(left))}
                </T>
                <T dim size={12} center>
                  {left < 0 ? 'ккал сверх нормы' : 'ккал осталось'}
                </T>
              </View>
            </Ring>
            <Stat label="Норма" value={goal} />
          </Row>
          <Row gap={space.m} style={{ marginTop: space.s }}>
            <MacroBar label="Белки" value={sum(entries, 'protein')} goal={macros.protein} color={t.protein} />
            <MacroBar label="Жиры" value={sum(entries, 'fat')} goal={macros.fat} color={t.fat} />
            <MacroBar label="Углеводы" value={sum(entries, 'carbs')} goal={macros.carbs} color={t.carbs} />
          </Row>
          <View style={{ gap: 4, marginTop: space.s }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={13} weight="600">
                Клетчатка
              </T>
              <T dim size={12}>
                {/* Mostly estimated from carbs by food type: "≈" unless every entry has a real fiber value */}
                {fiberExact || entries.length === 0 ? '' : '≈ '}
                {fmt(fiber)} / {fmt(fiberDv)} г
              </T>
            </Row>
            <Bar value={fiber} max={fiberDv} color={t.accent} />
          </View>
          {proteinHint && entries.length > 0 ? (
            <T dim size={12} style={{ marginTop: space.xs }}>
              Белковых приёмов (от {PROTEIN_MEAL_MIN_G} г): {proteinMeals} из {mainMeals.length}
            </T>
          ) : null}
          <Pressable
            onPress={() => setWeighing(true)}
            accessibilityRole="button"
            accessibilityLabel={weight != null ? `Вес ${fmt(weight, 1)} кг, изменить` : 'Записать вес'}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              backgroundColor: t.accentSoft,
              borderRadius: radius.m,
              paddingVertical: 6,
              paddingHorizontal: 12,
              marginTop: space.s,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <T size={14} weight="600" color={t.accent}>
              {weight != null ? `Вес ${fmt(weight, 1)} кг` : date === todayKey() ? '+ Вес сегодня' : '+ Вес за этот день'}
            </T>
          </Pressable>
        </Card>

        {MEALS.map((m) => {
          const items = entries.filter((e) => e.meal_type === m.type);
          const kcal = sum(items, 'kcal');
          const protein = sum(items, 'protein');
          const lowProtein = proteinHint && m.type !== 'snack' && items.length > 0 && protein < PROTEIN_MEAL_MIN_G;
          return (
            <Card key={m.type}>
              <Row style={{ justifyContent: 'space-between' }}>
                <FoodPic art={MEAL_ART[m.type]} size={44} />
                <Pressable onPress={() => mealMenu(m.type, m.title)} style={{ flex: 1 }} hitSlop={6}>
                  <T size={17} weight="700">
                    {m.title}
                  </T>
                  <T dim size={13}>
                    {items.length ? `${fmt(kcal)} ккал · Б ${fmt(protein)} Ж ${fmt(sum(items, 'fat'))} У ${fmt(sum(items, 'carbs'))}` : 'Нет записей'}
                  </T>
                  {lowProtein ? (
                    <T dim size={12}>
                      Белка меньше {PROTEIN_MEAL_MIN_G} г
                    </T>
                  ) : null}
                </Pressable>
                <IconButton label="⋯" a11y={`Действия: ${m.title}`} onPress={() => mealMenu(m.type, m.title)} color={t.textDim} />
                <Plus a11y={`Добавить в ${m.title.toLowerCase()}`} onPress={() => router.push({ pathname: '/add-food', params: { meal: m.type } })} />
              </Row>
              {items.length > 0 && <Divider />}
              {items.map((e) => (
                <ListItem
                  key={e.id}
                  left={<FoodPic art={e.food_id == null && e.grams == null ? 'flame' : artFor(e.name)} size={36} />}
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
            <Icon name="chevRight" size={18} color={t.textDim} />
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

      <WeightModal
        visible={weighing}
        initial={weight}
        onClose={() => setWeighing(false)}
        onSave={async (v) => {
          await setMeasurement(db, date, 'weight', v);
          setWeighing(false);
          load();
        }}
      />

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
  const over = goal > 0 && value > goal * 1.02;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <T size={13} weight="600">
        {label}
      </T>
      <Bar value={value} max={goal} color={color} />
      <T dim size={12}>
        {fmt(value)} / {fmt(goal)} г
      </T>
      {over ? (
        <T dim size={11}>
          сверх нормы на {fmt(value - goal)} г
        </T>
      ) : null}
    </View>
  );
}

function WeightModal({ visible, initial, onClose, onSave }: { visible: boolean; initial: number | null; onClose: () => void; onSave: (v: number) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const v = parseNum(text);
  const ok = v != null && v >= 20 && v <= 400;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setText(initial != null ? fmt(initial, 1).replace(/\s/g, '') : '')}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: space.l }} onPress={onClose}>
          <Pressable style={{ backgroundColor: t.card, borderRadius: radius.l, padding: space.l, gap: space.m }} onPress={() => {}}>
            <T weight="700" size={17}>
              Вес
            </T>
            <NumField value={text} onChangeText={setText} suffix="кг" placeholder="0,0" autoFocus returnKeyType="done" onSubmitEditing={() => ok && onSave(v)} />
            <Button title="Сохранить" disabled={!ok} onPress={() => ok && onSave(v)} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
