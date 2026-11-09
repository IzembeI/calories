import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { currentWeight, saveProfile, type Profile } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { fromKey, toKey, todayKey } from '@/lib/dates';
import { ACTIVITY_LEVELS, GOALS, PROTEIN_GKG_PRESETS, PROTEIN_REF_BMI, dailyKcalGoal, fmt, gkgMacros, macroGrams, macroTargets, parseNum, proteinRefWeight, type ActivityLevel, type BodyInput, type Goal, type KcalMode, type ProteinRef, type Sex } from '@/lib/nutrition';
import { Button, Card, Choice, Divider, NumField, Row, Screen, Segmented, T } from '@/ui/components';
import { GoalExplainCard, PaceChips } from '@/ui/goal-explain';
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
  const [kcalMode, setKcalMode] = useState<KcalMode>(p.kcal_mode);
  const auto = kcalMode !== 'manual';
  const setAuto = (on: boolean) => setKcalMode(on ? (p.kcal_mode === 'adaptive' ? 'adaptive' : 'formula') : 'manual');
  const [kcal, setKcal] = useState(String(p.kcal_goal));
  const [pp, setPp] = useState(String(p.protein_pct));
  const [fp, setFp] = useState(String(p.fat_pct));
  const [cp, setCp] = useState(String(p.carbs_pct));
  const [mode, setMode] = useState<'pct' | 'g' | 'gkg'>(p.protein_gkg != null ? 'gkg' : p.protein_g != null ? 'g' : 'pct');
  const [gkg, setGkg] = useState(String(p.protein_gkg ?? 1.6));
  const [proteinRef, setProteinRef] = useState<ProteinRef>(p.protein_ref === 'actual' ? 'actual' : 'adjusted');
  const start = macroTargets(p);
  const [pg, setPg] = useState(String(start.protein));
  const [fg, setFg] = useState(String(start.fat));
  const [cg, setCg] = useState(String(start.carbs));
  const [weight, setWeight] = useState(p.start_weight_kg);

  useEffect(() => {
    currentWeight(db, p, todayKey()).then(setWeight);
  }, [db, p]);

  const h = parseNum(height) ?? p.height_cm;
  const body: BodyInput = { sex, birth_date: birth, height_cm: h, weight_kg: weight, activity_level: activity, goal, pace_kg_week: goal === 'maintain' ? 0 : parseNum(pace) ?? 0.5 };
  const autoKcal = dailyKcalGoal(body);
  // adaptive: the weekly check-in owns the goal, the formula is only shown for comparison
  const kcalGoal = kcalMode === 'formula' ? autoKcal : kcalMode === 'adaptive' ? p.kcal_goal : parseNum(kcal) ?? p.kcal_goal;
  const pctSum = (parseNum(pp) ?? 0) + (parseNum(fp) ?? 0) + (parseNum(cp) ?? 0);
  const m = macroGrams(kcalGoal, parseNum(pp) ?? 0, parseNum(fp) ?? 0, parseNum(cp) ?? 0);
  const gkgVal = parseNum(gkg) ?? 1.6;
  const refW = proteinRefWeight(weight, h, proteinRef);
  const obese = proteinRefWeight(weight, h, 'adjusted').adjusted;
  const mk = gkgMacros(kcalGoal, gkgVal, refW.kg, parseNum(fp) ?? 0);
  const gP = parseNum(pg), gF = parseNum(fg), gC = parseNum(cg);
  const gramsKcal = (gP ?? 0) * 4 + (gF ?? 0) * 9 + (gC ?? 0) * 4;
  const fpVal = parseNum(fp);
  const macrosOk =
    mode === 'pct' ? pctSum === 100 : mode === 'gkg' ? fpVal != null && fpVal >= 0 && fpVal <= 100 : gP != null && gF != null && gC != null && gP >= 0 && gF >= 0 && gC >= 0;
  const valid = macrosOk && kcalGoal >= 800 && kcalGoal <= 6000 && h >= 100 && h <= 250;

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
      kcal_mode: kcalMode,
      protein_pct: parseNum(pp) ?? 25,
      fat_pct: parseNum(fp) ?? 30,
      carbs_pct: parseNum(cp) ?? 45,
      protein_g: mode === 'g' ? gP : null,
      fat_g: mode === 'g' ? gF : null,
      carbs_g: mode === 'g' ? gC : null,
      // g/kg mode is exclusive with the grams mode
      protein_gkg: mode === 'gkg' ? gkgVal : null,
      protein_ref: proteinRef,
    };
    await saveProfile(db, next);
    await reloadProfile();
    router.back();
  };

  return (
    <Screen>
      <T weight="700">Цель</T>
      <Segmented options={GOALS} value={goal} onChange={setGoal} />
      <NumField label="Желаемый вес" suffix="кг" value={target} onChangeText={setTarget} />
      {goal !== 'maintain' && (
        <>
          <T dim size={13}>
            Темп, кг в неделю · % от веса
          </T>
          <PaceChips value={parseNum(pace) ?? 0.5} weight={weight} onChange={(v) => setPace(String(v))} />
        </>
      )}

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
      <GoalExplainCard
        body={body}
        note={
          kcalMode === 'manual'
            ? `Сейчас своя норма ${fmt(kcalGoal)} ккал, расчёт — для сравнения.`
            : kcalMode === 'adaptive'
              ? `Норму ${fmt(kcalGoal)} ккал ведёт недельный пересчёт по фактическим данным, формула — для сравнения.`
              : 'Вес берётся по тренду. При изменении нормы на 20 ккал и больше на экране «Прогресс» появится предложение её обновить, не чаще раза в неделю.'
        }
      />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>Считать автоматически</T>
            <T dim size={12}>
              По тренду веса {fmt(weight, 1)} кг: {fmt(autoKcal)} ккал
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
        Белки, жиры, углеводы
      </T>
      <Segmented
        options={[
          { value: 'pct', title: 'В процентах' },
          { value: 'g', title: 'В граммах' },
          { value: 'gkg', title: 'г/кг' },
        ]}
        value={mode}
        onChange={(v) => {
          if (v === 'g') {
            const cur = mode === 'gkg' ? mk : m;
            setPg(String(cur.protein));
            setFg(String(cur.fat));
            setCg(String(cur.carbs));
          }
          setMode(v);
        }}
      />
      {mode === 'pct' ? (
        <>
          <Row>
            <NumField style={{ flex: 1 }} label={`Белки · ${m.protein} г`} suffix="%" value={pp} onChangeText={setPp} />
            <NumField style={{ flex: 1 }} label={`Жиры · ${m.fat} г`} suffix="%" value={fp} onChangeText={setFp} />
            <NumField style={{ flex: 1 }} label={`Углев. · ${m.carbs} г`} suffix="%" value={cp} onChangeText={setCp} />
          </Row>
          {pctSum !== 100 ? <T color={t.danger} size={13}>Сумма должна быть 100%, сейчас {fmt(pctSum)}%</T> : null}
        </>
      ) : mode === 'gkg' ? (
        <>
          <T dim size={13}>
            Белок, г на кг веса
          </T>
          <Segmented
            options={PROTEIN_GKG_PRESETS.map((v) => ({ value: String(v), title: fmt(v, 1) }))}
            value={PROTEIN_GKG_PRESETS.map(String).find((v) => Math.abs(Number(v) - gkgVal) < 0.001) ?? ''}
            onChange={setGkg}
          />
          <T dim size={12}>
            1,2–1,6 — для всех, 1,6–2,2 — при силовых тренировках. Старше 65 — 1,0–1,2; при болезни почек обсудите с врачом.
          </T>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T>
                  {refW.adjusted ? `Расчётный вес (ИМТ ${PROTEIN_REF_BMI})` : 'Вес по тренду'}: {fmt(refW.kg, 1)} кг
                </T>
                <T dim size={12}>
                  {obese
                    ? 'При ИМТ от 30 белок считаем от веса при ИМТ 27 — это наш выбор, не норма. Можно считать от фактического веса.'
                    : 'Белок считается от веса по тренду.'}
                </T>
              </View>
              {obese ? (
                <Switch
                  value={proteinRef === 'actual'}
                  onValueChange={(on) => setProteinRef(on ? 'actual' : 'adjusted')}
                  trackColor={{ true: t.accent }}
                  accessibilityLabel="Считать от фактического веса"
                />
              ) : null}
            </Row>
          </Card>
          <Row>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <T>Белки · {mk.protein} г</T>
              <T dim size={12}>
                Углеводы · {mk.carbs} г — остаток
              </T>
            </View>
            <NumField style={{ flex: 1 }} label={`Жиры · ${mk.fat} г`} suffix="%" value={fp} onChangeText={setFp} />
          </Row>
          <T dim size={12}>
            Жиры не опускаются ниже 20% калорий. Если белок не помещается в норму, он снижается до 1,2 г/кг.
          </T>
          {!macrosOk ? <T color={t.danger} size={13}>Укажите долю жиров от 0 до 100%</T> : null}
        </>
      ) : (
        <>
          <Row>
            <NumField style={{ flex: 1 }} label="Белки" suffix="г" value={pg} onChangeText={setPg} keyboardType="number-pad" />
            <NumField style={{ flex: 1 }} label="Жиры" suffix="г" value={fg} onChangeText={setFg} keyboardType="number-pad" />
            <NumField style={{ flex: 1 }} label="Углеводы" suffix="г" value={cg} onChangeText={setCg} keyboardType="number-pad" />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T dim size={13} style={{ flex: 1 }}>
              По БЖУ выходит {fmt(gramsKcal)} ккал{Math.abs(gramsKcal - kcalGoal) > 50 ? `, норма ${fmt(kcalGoal)}` : ''}
            </T>
            {Math.abs(gramsKcal - kcalGoal) > 50 ? (
              <Button
                small
                kind="secondary"
                title="Сделать нормой"
                onPress={() => {
                  setAuto(false);
                  setKcal(String(Math.round(gramsKcal)));
                }}
              />
            ) : null}
          </Row>
        </>
      )}

      <Button title={`Сохранить · ${fmt(kcalGoal)} ккал`} onPress={save} disabled={!valid} />
    </Screen>
  );
}
