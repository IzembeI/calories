import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { saveProfile, setMeasurement, type Profile } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { fromKey, toKey, todayKey } from '@/lib/dates';
import {
  ACTIVITY_LEVELS,
  GOALS,
  bmi,
  dailyKcalGoal,
  fmt,
  macroGrams,
  paceAsPctBW,
  parseNum,
  type ActivityLevel,
  type BodyInput,
  type Goal,
  type Sex,
} from '@/lib/nutrition';
import { Bar, Button, Card, Choice, NumField, Row, Screen, Segmented, T, Title } from '@/ui/components';
import { GoalExplainCard, PACES } from '@/ui/goal-explain';
import { space, useTheme } from '@/ui/theme';

export default function Onboarding() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { reloadProfile } = useApp();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>('lose');
  /** «Просто считать калории»: maintain, no target weight and pace questions */
  const [simple, setSimple] = useState(false);
  const [sex, setSex] = useState<Sex>('male');
  const [birth, setBirth] = useState('1995-01-01');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>('light');
  const [pace, setPace] = useState(0.5);
  const [saving, setSaving] = useState(false);

  const h = parseNum(height);
  const w = parseNum(weight);
  const tw = goal === 'maintain' ? w : parseNum(target);

  const steps = goal === 'maintain' ? ['goal', 'body', 'weight', 'activity', 'result'] : ['goal', 'body', 'weight', 'activity', 'pace', 'result'];
  const current = steps[step];

  const body = useMemo<BodyInput | null>(
    () => (h && w ? { sex, birth_date: birth, height_cm: h, weight_kg: w, activity_level: activity, goal, pace_kg_week: goal === 'maintain' ? 0 : pace } : null),
    [h, w, sex, birth, activity, goal, pace],
  );
  const kcal = body ? dailyKcalGoal(body) : 0;

  const canNext = () => {
    if (current === 'body') return !!h && h >= 100 && h <= 250;
    if (current === 'weight') {
      if (!w || w < 30 || w > 300) return false;
      if (goal === 'maintain') return true;
      if (!tw || tw < 30 || tw > 300) return false;
      return goal === 'lose' ? tw < w : tw > w;
    }
    return true;
  };

  const next = () => {
    if (current === 'weight' && goal === 'lose' && tw && h && bmi(tw, h) < 18.5) {
      Alert.alert('Цель ниже нормы', 'Целевой вес даёт индекс массы тела ниже 18,5. Можно продолжить, но лучше обсудить цель с врачом.', [
        { text: 'Изменить', style: 'cancel' },
        { text: 'Продолжить', onPress: () => setStep((s) => s + 1) },
      ]);
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const finish = async () => {
    if (!h || !w || !tw) return;
    setSaving(true);
    const p: Profile = {
      sex,
      birth_date: birth,
      height_cm: h,
      start_weight_kg: w,
      target_weight_kg: tw,
      activity_level: activity,
      goal,
      pace_kg_week: goal === 'maintain' ? 0 : pace,
      kcal_goal: kcal,
      kcal_auto: 1,
      kcal_mode: 'formula',
      protein_pct: 25,
      fat_pct: 30,
      carbs_pct: 45,
      water_goal_ml: Math.round((w * 30) / 250) * 250,
      glass_ml: 250,
    };
    await saveProfile(db, p);
    await setMeasurement(db, todayKey(), 'weight', w);
    await reloadProfile();
  };

  const macros = macroGrams(kcal, 25, 30, 45);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.s }}>
        <Bar value={step + 1} max={steps.length} color={t.accent} />
      </View>
      <Screen>
        {current === 'goal' && (
          <>
            <Title>Какая у вас цель?</Title>
            <Choice
              title="Просто считать калории"
              hint="Без цели по весу — норма на поддержание"
              selected={simple}
              onPress={() => {
                setSimple(true);
                setGoal('maintain');
              }}
            />
            {GOALS.map((g) => (
              <Choice
                key={g.value}
                title={g.title}
                selected={!simple && goal === g.value}
                onPress={() => {
                  setSimple(false);
                  setGoal(g.value);
                }}
              />
            ))}
          </>
        )}

        {current === 'body' && (
          <>
            <Title>О вас</Title>
            <T dim>
              {simple
                ? 'Цель по весу не нужна, но пол, возраст, рост и вес нужны: без них не посчитать, сколько калорий вы тратите за день.'
                : 'Нужно для расчёта нормы калорий.'}
            </T>
            <Segmented
              options={[
                { value: 'male', title: 'Мужчина' },
                { value: 'female', title: 'Женщина' },
              ]}
              value={sex}
              onChange={setSex}
            />
            <Card>
              <T dim size={13}>Дата рождения</T>
              <DateTimePicker
                value={fromKey(birth)}
                mode="date"
                display="spinner"
                locale="ru-RU"
                maximumDate={new Date(new Date().getFullYear() - 12, 11, 31)}
                minimumDate={new Date(1930, 0, 1)}
                onChange={(_, d) => d && setBirth(toKey(d))}
              />
            </Card>
            <NumField label="Рост" suffix="см" value={height} onChangeText={setHeight} placeholder="175" keyboardType="number-pad" />
          </>
        )}

        {current === 'weight' && (
          <>
            <Title>Вес</Title>
            <NumField label="Текущий вес" suffix="кг" value={weight} onChangeText={setWeight} placeholder="80" />
            {goal !== 'maintain' && (
              <NumField label="Желаемый вес" suffix="кг" value={target} onChangeText={setTarget} placeholder={goal === 'lose' ? '72' : '85'} />
            )}
            {w && tw && goal !== 'maintain' && !canNext() ? (
              <T color={t.danger} size={14}>
                {goal === 'lose' ? 'Желаемый вес должен быть меньше текущего' : 'Желаемый вес должен быть больше текущего'}
              </T>
            ) : null}
            {w && h ? <T dim size={14}>Индекс массы тела сейчас: {fmt(bmi(w, h), 1)}</T> : null}
          </>
        )}

        {current === 'activity' && (
          <>
            <Title>Активность</Title>
            {ACTIVITY_LEVELS.map((a) => (
              <Choice key={a.value} title={a.title} hint={a.hint} selected={activity === a.value} onPress={() => setActivity(a.value)} />
            ))}
          </>
        )}

        {current === 'pace' && (
          <>
            <Title>{goal === 'lose' ? 'Как быстро худеть?' : 'Как быстро набирать?'}</Title>
            {PACES.map((p) => (
              <Choice
                key={p}
                title={`${fmt(p, 2)} кг в неделю`}
                hint={`${p <= 0.25 ? 'Мягко' : p <= 0.5 ? 'Рекомендуется' : p <= 0.75 ? 'Быстро' : 'Очень быстро'}${w ? ` · ${fmt(paceAsPctBW(p, w), 1)}% веса в неделю` : ''}`}
                selected={pace === p}
                onPress={() => setPace(p)}
              />
            ))}
            {w && tw ? (
              <T dim size={14}>Примерно {Math.ceil(Math.abs(w - tw) / pace)} недель до цели.</T>
            ) : null}
          </>
        )}

        {current === 'result' && (
          <>
            <Title>Ваша норма</Title>
            <Card style={{ alignItems: 'center' }}>
              <T size={44} weight="800" color={t.accent}>
                {fmt(kcal)}
              </T>
              <T dim>ккал в день</T>
            </Card>
            <Card>
              <Row style={{ justifyContent: 'space-around' }}>
                <Macro label="Белки" grams={macros.protein} color={t.protein} />
                <Macro label="Жиры" grams={macros.fat} color={t.fat} />
                <Macro label="Углеводы" grams={macros.carbs} color={t.carbs} />
              </Row>
            </Card>
            {body ? <GoalExplainCard body={body} /> : null}
            <T dim size={13}>
              Норму и распределение БЖУ можно изменить в профиле.
            </T>
          </>
        )}

        <Row style={{ marginTop: space.m }}>
          {step > 0 && <Button title="Назад" kind="secondary" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />}
          {current === 'result' ? (
            <Button title="Начать" onPress={finish} loading={saving} style={{ flex: 2 }} />
          ) : (
            <Button title="Далее" onPress={next} disabled={!canNext()} style={{ flex: 2 }} />
          )}
        </Row>
      </Screen>
    </SafeAreaView>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <T size={20} weight="700" color={color}>
        {grams} г
      </T>
      <T dim size={13}>
        {label}
      </T>
    </View>
  );
}
