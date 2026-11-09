import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { currentWeight } from '@/db/repo';
import { useProfile } from '@/lib/app-state';
import { addDays, formatDay, todayKey } from '@/lib/dates';
import { NUTRIENTS, addMicros, dvFor, microsByDay, pctDV, type Micros, type NutrientDef } from '@/lib/micros';
import { fmt } from '@/lib/nutrition';
import { Bar, Card, Divider, Row, Screen, Segmented, T } from '@/ui/components';
import { radius, useTheme } from '@/ui/theme';

type Mode = 'period' | '7' | '14';

/** A deficiency is only suggested from an average over at least this many logged days. */
const MIN_DAYS_FOR_DEFICIT = 7;
const DEFICIT_PCT = 70;

export default function Nutrients() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { from = todayKey(), to = todayKey() } = useLocalSearchParams<{ from?: string; to?: string }>();
  const [mode, setMode] = useState<Mode>('period');
  const [m, setM] = useState<Micros>({});
  const [days, setDays] = useState(0);
  const [weight, setWeight] = useState<number | undefined>(undefined);

  const rangeFrom = mode === 'period' ? from : addDays(to, -(Number(mode) - 1));
  const single = mode === 'period' && from === to;

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([microsByDay(db, rangeFrom, to), currentWeight(db, profile, to)]).then(([byDay, w]) => {
        if (!alive) return;
        // Average over logged days only: days without food entries would pull everything down.
        let total: Micros = {};
        for (const v of byDay.values()) total = addMicros(total, v);
        const n = Math.max(byDay.size, 1);
        const avg: Micros = {};
        for (const [k, v] of Object.entries(total)) avg[k as keyof Micros] = (v ?? 0) / n;
        setM(avg);
        setDays(byDay.size);
        setWeight(w);
      });
      return () => {
        alive = false;
      };
    }, [db, rangeFrom, to, profile]),
  );

  const normP = { ...profile, weight_kg: weight };
  const canFlagDeficit = days >= MIN_DAYS_FOR_DEFICIT;

  const badge = (text: string, color: string) => (
    <View style={{ alignSelf: 'flex-start', borderRadius: radius.s, borderWidth: 1, borderColor: color, paddingHorizontal: 6, paddingVertical: 1 }}>
      <T size={11} weight="600" color={color}>
        {text}
      </T>
    </View>
  );

  const section = (title: string, defs: NutrientDef[]) => (
    <Card>
      <T weight="700">{title}</T>
      {defs.map((d, i) => {
        const v = m[d.key] ?? 0;
        const dv = dvFor(d, normP);
        const pct = pctDV(d, v, normP);
        const color = d.limit ? (pct > 100 ? t.danger : t.accent) : pct >= 80 ? t.accent : pct >= 40 ? t.warn : t.danger;
        const over = d.limit && pct > 100;
        const deficit = !d.limit && canFlagDeficit && pct < DEFICIT_PCT;
        return (
          <View key={d.key} style={{ gap: 4 }}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between', paddingTop: 6 }}>
              <T size={15} style={{ flexShrink: 1 }}>
                {d.title}
              </T>
              <T size={14} dim>
                ≈ {fmt(v, v < 10 ? 1 : 0)} {d.unit} · {fmt(pct)}% {d.limit ? `из макс. ${fmt(dv, dv < 10 ? 1 : 0)}` : `из ${fmt(dv, dv < 10 ? 1 : 0)}`}
              </T>
            </Row>
            <Bar value={Math.min(pct, 100)} max={100} color={color} />
            {over ? badge('выше лимита', t.danger) : deficit ? badge('возможный недостаток', t.warn) : null}
          </View>
        );
      })}
    </Card>
  );

  const periodText = single
    ? formatDay(from, true)
    : `${formatDay(rangeFrom)} — ${formatDay(to, true)}, в среднем за ${days} дн. с записями`;

  return (
    <Screen>
      <Segmented<Mode>
        options={[
          { value: 'period', title: from === to ? 'День' : 'Период' },
          { value: '7', title: '7 дней' },
          { value: '14', title: '14 дней' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <T dim size={13}>
        {periodText}. Примерная оценка: по данным с этикетки, если они есть, иначе по типу продукта (справочник USDA). Нормы — по МР
        2.3.1.0253-21 для вашего пола и возраста. Быстрые записи без продукта не учитываются.
      </T>
      {!canFlagDeficit ? (
        <T dim size={12}>
          О возможном недостатке скажем по среднему, когда наберётся {MIN_DAYS_FOR_DEFICIT} дней с записями. По одному дню судить нельзя.
        </T>
      ) : null}
      {profile.kcal_goal < 1500 ? (
        <Card>
          <T weight="700">При норме меньше 1500 ккал</T>
          <T dim size={13}>
            На таком рационе трудно получить из еды достаточно витамина D, витамина E и йода. Йод приложение не считает. Обсудите с врачом,
            нужны ли вам добавки или йодированная соль.
          </T>
        </Card>
      ) : null}
      {section('Витамины', NUTRIENTS.filter((d) => d.group === 'vitamin'))}
      {section('Минералы', NUTRIENTS.filter((d) => d.group === 'mineral'))}
      {section('Сахар, клетчатка, жиры', NUTRIENTS.filter((d) => d.group === 'other'))}
    </Screen>
  );
}
