import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { currentWeight, dailyTotals, mealKcal, topKcalFoods, weightTrendAt } from '@/db/repo';
import { useProfile } from '@/lib/app-state';
import { formatShort, todayKey } from '@/lib/dates';
import { macroTargets, fmt } from '@/lib/nutrition';
import { goalForDate } from '@/lib/schedule';
import { buildReview, reviewPeriod, type Review, type Tone } from '@/lib/review';
import { Card, Row, Screen, T } from '@/ui/components';
import { radius, space, useTheme } from '@/ui/theme';

export default function ReviewScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const [r, setR] = useState<Review | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const today = todayKey();
        const { from, to } = reviewPeriod(today);
        const [days, meals, topFoods, trend, w] = await Promise.all([
          dailyTotals(db, from, to),
          mealKcal(db, from, to),
          topKcalFoods(db, from, to),
          weightTrendAt(db, today),
          currentWeight(db, profile, today),
        ]);
        setR(
          buildReview({
            days, from, to, meals, topFoods,
            kcalGoal: profile.kcal_goal,
            goalFor: (d) => goalForDate(profile, d),
            proteinGoal: macroTargets(profile, w).protein,
            goal: profile.goal,
            sex: profile.sex,
            weightPerWeek: trend?.perWeek ?? null,
          }),
        );
      })();
    }, [db, profile]),
  );

  if (!r) return null;
  const dot: Record<Tone, string> = { good: t.accent, warn: t.warn, info: t.textDim };

  return (
    <Screen>
      <T dim size={13}>
        {formatShort(r.from)} — {formatShort(r.to)} · семь последних завершённых дней
      </T>
      {r.logged > 0 ? (
        <Row gap={space.m}>
          <Stat value={`${r.logged} из 7`} label="дней с записями" />
          <Stat value={fmt(r.avgKcal)} label="ккал в среднем" />
          <Stat value={`${r.inBand} из ${r.logged}`} label="дней в норме" />
        </Row>
      ) : null}
      {r.findings.map((f, i) => (
        <Card key={i}>
          <Row gap={space.s} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot[f.tone], marginTop: 6 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <T weight="700">{f.title}</T>
              <T dim size={14}>
                {f.text}
              </T>
            </View>
          </Row>
        </Card>
      ))}
      <T dim size={12} center>
        Разбор считается по простым правилам прямо на телефоне. Данные никуда не отправляются.
      </T>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.card, borderRadius: radius.l, padding: space.m, alignItems: 'center', gap: 2 }}>
      <T size={17} weight="800" center>
        {value}
      </T>
      <T dim size={12} center>
        {label}
      </T>
    </View>
  );
}
