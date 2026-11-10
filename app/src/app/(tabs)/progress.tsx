import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { dailyTotals, getSetting, latestMeasurements, measuredTypes, saveProfile, series, setSetting, type DayTotals, type MeasurementRow } from '@/db/repo';
import { useApp, useProfile } from '@/lib/app-state';
import { addDays, daysBetween, formatShort, todayKey } from '@/lib/dates';
import { estimateExpenditure, suggestGoal, MIN_LOGGED, MIN_WEIGH_INS } from '@/lib/expenditure';
import { forecast, forecastText } from '@/lib/forecast';
import { answerKcalRecalc, pendingKcalRecalc, type KcalRecalc } from '@/lib/goal-recalc';
import { MEASUREMENTS } from '@/lib/measurements';
import { ACTIVITY_LEVELS, fmt, macroTargets, tdee } from '@/lib/nutrition';
import { TREND_FROM, WEIGH_HINTS, trendText, weightTrend, type WeighHint } from '@/lib/trend';
import { BarChart, LineChart } from '@/ui/charts';
import { Bar, Button, Card, Divider, IconButton, ListItem, Row, Screen, Segmented, T } from '@/ui/components';
import { useTheme } from '@/ui/theme';

type Range = '7' | '30' | '90' | '365';

export default function Progress() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const [range, setRange] = useState<Range>('30');
  const [weights, setWeights] = useState<MeasurementRow[]>([]);
  const [totals, setTotals] = useState<DayTotals[]>([]);
  const [latest, setLatest] = useState<Record<string, MeasurementRow>>({});
  const [firstInRange, setFirstInRange] = useState<Record<string, number>>({});
  const [types, setTypes] = useState<string[]>([]);
  const [hint, setHint] = useState<WeighHint>('daily');
  const { reloadProfile } = useApp();
  const [recalc, setRecalc] = useState<KcalRecalc | null>(null);
  /** diary totals of the last 5 weeks, whatever range is shown: the expenditure estimate needs them */
  const [recent, setRecent] = useState<DayTotals[]>([]);
  /** local date of the last answer to the weekly expenditure check-in */
  const [checkinAt, setCheckinAt] = useState<string | null | undefined>(undefined);

  const to = todayKey();
  const from = addDays(to, -(Number(range) - 1));

  const load = useCallback(async () => {
    // All weigh-ins up to the range end: the trend needs history before the range to be settled.
    const [w, tt, l, ty, h, rc, ca] = await Promise.all([
      series(db, 'weight', '0000-01-01', to),
      dailyTotals(db, from, to),
      latestMeasurements(db, to),
      measuredTypes(db),
      getSetting<WeighHint>(db, 'weigh_hint', 'daily'),
      dailyTotals(db, addDays(to, -35), to),
      getSetting<string | null>(db, 'adaptive_checkin_at', null),
    ]);
    setRecent(rc);
    setCheckinAt(ca);
    setWeights(w);
    setHint(h === 'weekly' ? 'weekly' : 'daily');
    setTotals(tt);
    setLatest(l);
    setTypes(ty);
    const firsts: Record<string, number> = {};
    for (const type of ty) {
      const s = await series(db, type, from, to);
      if (s.length) firsts[type] = s[0].value;
    }
    setFirstInRange(firsts);
  }, [db, from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      pendingKcalRecalc(db, profile, to).then(setRecalc);
    }, [db, profile, to]),
  );

  const answerRecalc = async (accept: boolean) => {
    if (!recalc) return;
    setRecalc(null);
    await answerKcalRecalc(db, profile, recalc, accept, to);
    if (accept) await reloadProfile();
  };

  const n = totals.length;
  const avg = (k: 'kcal' | 'protein' | 'fat' | 'carbs') => (n ? totals.reduce((a, x) => a + x[k], 0) / n : 0);
  const bars = daysBetween(from, to).map((d) => ({ date: d, value: totals.find((x) => x.date === d)?.kcal ?? 0 }));
  const trend = useMemo(() => weightTrend(weights.map((w) => ({ date: w.date, value: w.value }))), [weights]);
  const trendLine = useMemo(
    () => (trend ? trend.series.slice(TREND_FROM).filter((p) => p.date >= from).map((p) => ({ date: p.date, value: p.trend })) : []),
    [trend, from],
  );
  const head = trend ? trendText(trend) : null;
  const curW = trend?.value ?? profile.start_weight_kg;
  const goals = macroTargets(profile, curW);
  const toGo = curW - profile.target_weight_kg;
  const progressPct =
    profile.start_weight_kg === profile.target_weight_kg ? 1 : (profile.start_weight_kg - curW) / (profile.start_weight_kg - profile.target_weight_kg);

  // ----- real expenditure and the weekly check-in -----
  const body = useMemo(() => ({ ...profile, weight_kg: curW }), [profile, curW]);
  const exp = useMemo(() => estimateExpenditure(recent, trend?.series ?? [], body, profile.kcal_goal, to), [recent, trend, body, profile.kcal_goal, to]);
  const suggestion = exp.ok && profile.kcal_mode !== 'manual' ? suggestGoal(exp.e, body, profile.kcal_goal) : null;
  const checkinDue = checkinAt !== undefined && (checkinAt == null || checkinAt <= addDays(to, -7));
  const answerCheckin = async (accept: boolean) => {
    if (!suggestion) return;
    setCheckinAt(to);
    await setSetting(db, 'adaptive_checkin_at', to);
    if (accept) {
      await saveProfile(db, { ...profile, kcal_goal: suggestion.to, kcal_mode: 'adaptive' });
      await reloadProfile();
    }
  };

  // ----- forecast of the goal date -----
  const fc = useMemo(() => {
    if (profile.goal === 'maintain' || !trend) return null;
    const last14 = recent.filter((d) => d.date >= addDays(to, -14) && d.date < to && d.kcal >= profile.kcal_goal * 0.4);
    const intake = last14.length >= 7 ? last14.reduce((s, d) => s + d.kcal, 0) / last14.length : profile.kcal_goal;
    const factor = ACTIVITY_LEVELS.find((a) => a.value === profile.activity_level)?.factor ?? 1.2;
    return forecast(curW, profile.target_weight_kg, intake, exp.ok ? exp.e.tdee : tdee(body), factor, to);
  }, [profile, trend, recent, to, curW, exp, body]);
  // on the chart the projection takes at most as much room as the history
  const fcLine = useMemo(() => {
    if (!fc?.points.length || !trendLine.length) return undefined;
    const until = addDays(to, Number(range));
    return [trendLine[trendLine.length - 1], ...fc.points.slice(1).filter((p) => p.date <= until)];
  }, [fc, trendLine, to, range]);

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <IconButton label="PDF" onPress={() => router.push('/export')} /> }} />
      <Segmented
        options={[
          { value: '7', title: 'Неделя' },
          { value: '30', title: 'Месяц' },
          { value: '90', title: '3 мес.' },
          { value: '365', title: 'Год' },
        ]}
        value={range}
        onChange={setRange}
      />

      <Card onPress={() => router.push({ pathname: '/series/[type]', params: { type: 'weight' } })}>
        <T dim size={13}>
          Вес{head ? ` · ${head.note}` : ''}
        </T>
        <T size={20} weight="800">
          {head ? head.title : `${fmt(curW, 1)} кг`}
        </T>
        <Row style={{ justifyContent: 'space-between' }}>
          <T dim size={13}>
            Цель {fmt(profile.target_weight_kg, 1)} кг
          </T>
          <T weight="600" color={t.accent}>
            {profile.goal === 'maintain' ? 'держим вес' : Math.abs(toGo) < 0.05 ? 'цель достигнута' : `осталось ${fmt(Math.abs(toGo), 1)} кг`}
          </T>
        </Row>
        {profile.goal !== 'maintain' ? <Bar value={Math.max(progressPct, 0)} max={1} color={t.accent} height={8} /> : null}
        <LineChart
          points={weights.filter((w) => w.date >= from).map((w) => ({ date: w.date, value: w.value }))}
          trend={trendLine}
          target={profile.target_weight_kg}
          forecast={fcLine}
        />
        {fc ? (
          <T size={13} weight="600">
            {fc.from ? `${fmt(profile.target_weight_kg, 1)} кг: ${forecastText(fc)}` : forecastText(fc)}
          </T>
        ) : null}
        <T dim size={12}>
          {WEIGH_HINTS[hint]}
        </T>
      </Card>

      {exp.ok ? (
        <Card>
          <T dim size={13}>
            Реальный расход
          </T>
          <T size={20} weight="800">
            ≈ {fmt(exp.e.tdee)} ккал в день (±{exp.e.band})
          </T>
          <T dim size={13}>
            По дневнику за {exp.e.loggedDays} дн. и тренду веса. Формула даёт {fmt(exp.e.formula)} ккал.
            {profile.kcal_mode === 'manual' ? ' Норма задана вручную, поэтому мы её не трогаем.' : ''}
          </T>
          {suggestion && checkinDue ? (
            <>
              <Divider />
              <T weight="700">
                Норма: {fmt(suggestion.from)} → {fmt(suggestion.to)} ккал
              </T>
              <T dim size={13}>
                {suggestion.reason} Меняем не больше чем на 150 ккал за раз и предлагаем не чаще раза в неделю.
              </T>
              <Row>
                <Button small title="Принять" onPress={() => answerCheckin(true)} style={{ flex: 1 }} />
                <Button small kind="secondary" title="Оставить" onPress={() => answerCheckin(false)} style={{ flex: 1 }} />
              </Row>
            </>
          ) : null}
        </Card>
      ) : (
        <T dim size={12}>
          {exp.reason === 'paused'
            ? 'Реальный расход на паузе: в последние 7 дней мало заполненных дней.'
            : `Реальный расход посчитаем, когда за 4 недели наберётся ${MIN_LOGGED} заполненных дней и ${MIN_WEIGH_INS} взвешивания. Сейчас: ${exp.loggedDays} дн. и ${exp.weighIns} взвеш.`}
        </T>
      )}

      {recalc && !exp.ok ? (
        <Card>
          <T weight="700">
            Норма: {fmt(recalc.from)} → {fmt(recalc.to)} ккал
          </T>
          <T dim size={13}>
            Пересчёт по тренду веса {fmt(recalc.weight, 1)} кг. Предлагаем не чаще раза в неделю.
          </T>
          <Row>
            <Button small title="Обновить" onPress={() => answerRecalc(true)} style={{ flex: 1 }} />
            <Button small kind="secondary" title="Оставить" onPress={() => answerRecalc(false)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : null}

      <Row>
        <Button title="Разбор недели" kind="secondary" onPress={() => router.push('/review')} style={{ flex: 1 }} />
        <Button title="Мой росток" kind="secondary" onPress={() => router.push('/game')} style={{ flex: 1 }} />
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T weight="700">Калории</T>
          <T dim size={13}>
            в среднем {fmt(avg('kcal'))} из {fmt(profile.kcal_goal)}
          </T>
        </Row>
        <BarChart points={bars} goal={profile.kcal_goal} />
        <T dim size={12}>
          Дней с записями: {n} из {bars.length}
        </T>
      </Card>

      <Card>
        <T weight="700">БЖУ в среднем за день</T>
        <MacroRow label="Белки" value={avg('protein')} goal={goals.protein} color={t.protein} />
        <MacroRow label="Жиры" value={avg('fat')} goal={goals.fat} color={t.fat} />
        <MacroRow label="Углеводы" value={avg('carbs')} goal={goals.carbs} color={t.carbs} />
        <IconButton label="Витамины и минералы за период ›" onPress={() => router.push({ pathname: '/nutrients', params: { from, to } })} />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T weight="700">Замеры</T>
          <IconButton label="+ Добавить" onPress={() => router.push('/measurements')} />
        </Row>
        {MEASUREMENTS.filter((m) => types.includes(m.type)).map((m, i) => {
          const l = latest[m.type];
          const f = firstInRange[m.type];
          const d = l && f != null ? l.value - f : null;
          return (
            <View key={m.type}>
              {i > 0 && <Divider />}
              <ListItem
                title={m.title}
                subtitle={l ? `последний ${formatShort(l.date)}` : undefined}
                onPress={() => router.push({ pathname: '/series/[type]', params: { type: m.type } })}
                right={
                  <View style={{ alignItems: 'flex-end' }}>
                    <T weight="600">{l ? `${fmt(l.value, 1)} ${m.unit}` : '—'}</T>
                    {d != null && Math.abs(d) >= 0.05 ? (
                      <T size={12} color={d < 0 ? t.accent : t.warn}>
                        {d > 0 ? '+' : ''}
                        {fmt(d, 1)} за период
                      </T>
                    ) : null}
                  </View>
                }
              />
            </View>
          );
        })}
        {types.length === 0 ? <T dim size={14}>Замеров пока нет.</T> : null}
      </Card>
    </Screen>
  );
}

function MacroRow({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const over = goal > 0 && value > goal * 1.02;
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={14}>{label}</T>
        <T dim size={14}>
          {fmt(value)} / {fmt(goal)} г{over ? ` · сверх нормы на ${fmt(value - goal)} г` : ''}
        </T>
      </Row>
      <Bar value={value} max={goal} color={color} />
    </View>
  );
}
