// «Пауза»: a calm screen for the moment when you feel like overeating. Works offline, judges nothing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, Easing, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addFoodEntry, dailyTotals, defaultPortion, favouriteFoods, foodUsage, portion, recentFoods, undoFoodEntry, type FoodRow } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { todayKey, weekStart } from '@/lib/dates';
import { tap } from '@/lib/haptics';
import { fmt } from '@/lib/nutrition';
import { goalForDate } from '@/lib/schedule';
import { Button, Card, Divider, ListItem, Plus, Screen, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';
import { useTheme } from '@/ui/theme';

const PAUSE_S = 120;
const BREATH_MS = 4000;
/** Even with nothing left for today, a small snack is shown rather than an empty list. */
const MIN_BUDGET = 150;

interface Option { f: FoodRow; grams: number; label: string | null; kcal: number; protein: number }

export default function Sos() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { showToast } = useApp();
  const [left, setLeft] = useState<number | null>(null);
  const [weekBalance, setWeekBalance] = useState<{ kcal: number; days: number } | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null); // seconds of the pause, null = not running
  const [finished, setFinished] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  const load = useCallback(async () => {
    const today = todayKey();
    const [week, fav, recent] = await Promise.all([dailyTotals(db, weekStart(today), today), favouriteFoods(db), recentFoods(db)]);
    const eaten = week.find((d) => d.date === today)?.kcal ?? 0;
    const l = goalForDate(profile, today) - eaten;
    setLeft(l);
    // finished days of this week only: today is still open
    const past = week.filter((d) => d.date !== today);
    setWeekBalance(past.length ? { kcal: past.reduce((s, d) => s + (goalForDate(profile, d.date) - d.kcal), 0), days: past.length } : null);
    const budget = Math.max(l, MIN_BUDGET);
    const seen = new Set<string>();
    const opts: Option[] = [];
    for (const f of [...fav, ...recent]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const d = defaultPortion(f);
      const n = portion(f, d.grams);
      if (n.kcal > 0 && n.kcal <= budget) opts.push({ f, grams: d.grams, label: d.label, kcal: n.kcal, protein: n.protein ?? 0 });
    }
    // most protein per calorie first: it keeps you full longer
    opts.sort((a, b) => b.protein / b.kcal - a.protein / a.kcal);
    setOptions(opts.slice(0, 6));
  }, [db, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion.current = v));
  }, []);

  const running = remaining != null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((s) => (s == null ? s : s - 1)), 1000);
    let anim: Animated.CompositeAnimation | null = null;
    if (!reduceMotion.current) {
      const step = (toValue: number) => Animated.timing(scale, { toValue, duration: BREATH_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
      anim = Animated.loop(Animated.sequence([step(1), step(0)]));
      anim.start();
    }
    return () => {
      clearInterval(id);
      anim?.stop();
      scale.setValue(0);
    };
  }, [running, scale]);

  useEffect(() => {
    if (remaining != null && remaining <= 0) {
      setRemaining(null);
      setFinished(true);
      AccessibilityInfo.announceForAccessibility('Пауза закончилась');
    }
  }, [remaining]);

  const add = async (o: Option) => {
    try {
      const prev = await foodUsage(db, o.f.id);
      const id = await addFoodEntry(db, todayKey(), 'snack', o.f, o.grams, o.label);
      tap();
      showToast({
        text: `Добавлено в перекусы: ${o.f.name} · ${fmt(o.kcal)} ккал`,
        action: { label: 'Отменить', onPress: async () => { await undoFoodEntry(db, id, prev); load(); } },
      });
      load();
    } catch (e) {
      Alert.alert('Не удалось добавить', String(e instanceof Error ? e.message : e));
    }
  };

  const phase = remaining == null ? '' : Math.floor((PAUSE_S - remaining) / (BREATH_MS / 1000)) % 2 === 0 ? 'Вдох' : 'Выдох';
  const mm = remaining == null ? '' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <T size={20} weight="800" center>
          Сначала две минуты
        </T>
        <T dim size={14} center>
          Тяга к еде приходит волной и часто слабеет, если её переждать. Подышите вместе с кругом, а потом решите.
        </T>
        <View style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center', marginVertical: 8 }}>
          <Animated.View
            style={{
              position: 'absolute',
              width: 170,
              height: 170,
              borderRadius: 85,
              backgroundColor: t.accentSoft,
              transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
            }}
          />
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <T size={running ? 22 : 15} weight="800" color={t.onAccent} center>
              {running ? mm : finished ? 'Готово' : '2:00'}
            </T>
            {running ? (
              <T size={12} color={t.onAccent}>
                {phase}
              </T>
            ) : null}
          </View>
        </View>
        {finished && !running ? (
          <T size={14} center>
            Пауза позади. Если есть всё ещё хочется — это нормально: выберите что-нибудь ниже и запишите.
          </T>
        ) : null}
        <Button
          title={running ? 'Остановить' : finished ? 'Ещё две минуты' : 'Начать'}
          kind={running ? 'secondary' : 'primary'}
          onPress={() => {
            setFinished(false);
            setRemaining(running ? null : PAUSE_S);
          }}
          style={{ alignSelf: 'stretch' }}
        />
      </Card>

      {left != null ? (
        <Card>
          <T weight="700">{left > 0 ? `На сегодня осталось ${fmt(left)} ккал` : 'Норма на сегодня выбрана'}</T>
          {weekBalance ? (
            <T dim size={14}>
              {weekBalance.kcal >= 0
                ? `За прошедшие дни недели (${weekBalance.days}) вы съели на ${fmt(weekBalance.kcal)} ккал меньше нормы — запас есть.`
                : `За прошедшие дни недели (${weekBalance.days}) вышло на ${fmt(-weekBalance.kcal)} ккал больше нормы.`}
            </T>
          ) : null}
          <T dim size={14}>
            Один день не решает ничего: вес меняется от средней за недели, а не от одного вечера.
          </T>
        </Card>
      ) : null}

      <Card>
        <T weight="700">Что поместится</T>
        <T dim size={13}>
          Из избранного и недавнего, сначала самое белковое — оно дольше держит сытость. Плюс добавляет в перекусы.
        </T>
        {options.length === 0 ? (
          <T dim size={14}>
            Подходящих продуктов пока нет. Они появятся, когда в дневнике накопятся записи или избранное.
          </T>
        ) : (
          options.map((o, i) => (
            <View key={o.f.id}>
              {i > 0 && <Divider />}
              <ListItem
                left={<FoodPic art={artFor(o.f.name, o.f.category)} />}
                title={o.f.name}
                subtitle={`${o.label ?? `${fmt(o.grams)} г`} · ${fmt(o.kcal)} ккал · белок ${fmt(o.protein)} г`}
                onPress={() => router.push({ pathname: '/food/[id]', params: { id: o.f.id, meal: 'snack' } })}
                right={<Plus a11y={`Добавить ${o.f.name} в перекусы`} onPress={() => add(o)} />}
              />
            </View>
          ))
        )}
      </Card>

      <Card>
        <T weight="700">Что ещё помогает</T>
        <T size={14}>• Выпить стакан воды или чая и подождать десять минут.</T>
        <T size={14}>• Выйти пройтись или просто сменить комнату.</T>
        <T size={14}>• Поесть нормально, если с прошлой еды прошло больше четырёх часов: это голод, а не срыв.</T>
        <T size={14}>• Положить порцию на тарелку, а не есть из упаковки.</T>
      </Card>

      <Card>
        <T dim size={14}>
          Если всё-таки съели больше, чем хотели, — запишите как есть. Честная запись полезнее идеального дневника, а завтра обычная норма, без «отработки».
        </T>
        <Button title="Записать еду" kind="secondary" onPress={() => router.push({ pathname: '/add-food', params: { meal: 'snack' } })} />
      </Card>
    </Screen>
  );
}
