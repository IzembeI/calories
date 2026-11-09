import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { currentWeight, saveProfile, type Profile } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { fromKey, toKey, todayKey } from '@/lib/dates';
import { ACTIVITY_LEVELS, GOALS, dailyKcalGoal, fmt, macroGrams, parseNum, type ActivityLevel, type Goal, type Sex } from '@/lib/nutrition';
import { Button, Card, Choice, Divider, NumField, Row, Screen, Segmented, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export default function Goals() {
  const db = useSQLiteContext();
  const t = useTheme();
  const p = useProfile();
  const { reloadProfile } = useApp();
  const [sex, setSex] = useState<Sex>(p.sex);
  const [birth, setBirth] = useState(p.birth_date);
  const [height, setHeight] = useState(String(p.height_cm));
  const [target, setTarget] = useState(String(p.target_weight_kg));
  const [goal, setGoal] = useState<Goal>(p.goal);
  const [activity, setActivity] = useState<ActivityLevel>(p.activity_level);
  const [pace, setPace] = useState(String(p.pace_kg_week || 0.5));
  const [auto, setAuto] = useState(p.kcal_auto === 1);
  const [kcal, setKcal] = useState(String(p.kcal_goal));
  const [pp, setPp] = useState(String(p.protein_pct));
  const [fp, setFp] = useState(String(p.fat_pct));
  const [cp, setCp] = useState(String(p.carbs_pct));
  const [weight, setWeight] = useState(p.start_weight_kg);

  useEffect(() => {
    currentWeight(db, p, todayKey()).then(setWeight);
  }, [db, p]);

  const h = parseNum(height) ?? p.height_cm;
  const autoKcal = dailyKcalGoal({ sex, birth_date: birth, height_cm: h, weight_kg: weight, activity_level: activity, goal, pace_kg_week: goal === 'maintain' ? 0 : parseNum(pace) ?? 0.5 });
  const kcalGoal = auto ? autoKcal : parseNum(kcal) ?? p.kcal_goal;
  const pctSum = (parseNum(pp) ?? 0) + (parseNum(fp) ?? 0) + (parseNum(cp) ?? 0);
  const m = macroGrams(kcalGoal, parseNum(pp) ?? 0, parseNum(fp) ?? 0, parseNum(cp) ?? 0);
  const valid = pctSum === 100 && kcalGoal >= 800 && kcalGoal <= 6000 && h >= 100 && h <= 250;

  const save = async () => {
    if (!valid) return;
    const next: Profile = {
      ...p,
      sex,
      birth_date: birth,
      height_cm: h,
      target_weight_kg: parseNum(target) ?? p.target_weight_kg,
      goal,
      activity_level: activity,
      pace_kg_week: goal === 'maintain' ? 0 : parseNum(pace) ?? 0.5,
      kcal_goal: Math.round(kcalGoal),
      kcal_auto: auto ? 1 : 0,
      protein_pct: parseNum(pp) ?? 25,
      fat_pct: parseNum(fp) ?? 30,
      carbs_pct: parseNum(cp) ?? 45,
    };
    await saveProfile(db, next);
    await reloadProfile();
    router.back();
  };

  return (
    <Screen>
      <T weight="700">Цель</T>
      <Segmented options={GOALS} value={goal} onChange={setGoal} />
      <Row>
        <NumField style={{ flex: 1 }} label="Желаемый вес" suffix="кг" value={target} onChangeText={setTarget} />
        {goal !== 'maintain' && <NumField style={{ flex: 1 }} label="Темп" suffix="кг/нед" value={pace} onChangeText={setPace} />}
      </Row>

      <T weight="700" style={{ marginTop: space.s }}>
        О вас
      </T>
      <Segmented options={[{ value: 'male', title: 'Мужчина' }, { value: 'female', title: 'Женщина' }]} value={sex} onChange={setSex} />
      <Card>
        <T dim size={13}>Дата рождения</T>
        <DateTimePicker value={fromKey(birth)} mode="date" display="compact" locale="ru-RU" onChange={(_, d) => d && setBirth(toKey(d))} />
      </Card>
      <NumField label="Рост" suffix="см" value={height} onChangeText={setHeight} />
      {ACTIVITY_LEVELS.map((a) => (
        <Choice key={a.value} title={a.title} hint={a.hint} selected={activity === a.value} onPress={() => setActivity(a.value)} />
      ))}

      <T weight="700" style={{ marginTop: space.s }}>
        Норма калорий
      </T>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Считать автоматически</T>
            <T dim size={12}>
              По текущему весу {fmt(weight, 1)} кг: {fmt(autoKcal)} ккал
            </T>
          </View>
          <Switch value={auto} onValueChange={setAuto} trackColor={{ true: t.accent }} />
        </Row>
        {!auto && (
          <>
            <Divider />
            <NumField label="Своя норма" suffix="ккал" value={kcal} onChangeText={setKcal} />
          </>
        )}
      </Card>

      <T weight="700" style={{ marginTop: space.s }}>
        Распределение БЖУ, %
      </T>
      <Row>
        <NumField style={{ flex: 1 }} label={`Белки · ${m.protein} г`} suffix="%" value={pp} onChangeText={setPp} />
        <NumField style={{ flex: 1 }} label={`Жиры · ${m.fat} г`} suffix="%" value={fp} onChangeText={setFp} />
        <NumField style={{ flex: 1 }} label={`Углев. · ${m.carbs} г`} suffix="%" value={cp} onChangeText={setCp} />
      </Row>
      {pctSum !== 100 ? <T color={t.danger} size={13}>Сумма должна быть 100%, сейчас {fmt(pctSum)}%</T> : null}

      <Button title={`Сохранить · ${fmt(kcalGoal)} ккал`} onPress={save} disabled={!valid} />
    </Screen>
  );
}
