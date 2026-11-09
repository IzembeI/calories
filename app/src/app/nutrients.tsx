import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { formatDay, todayKey } from '@/lib/dates';
import { NUTRIENTS, addMicros, microsByDay, pctDV, type Micros, type NutrientDef } from '@/lib/micros';
import { fmt } from '@/lib/nutrition';
import { Bar, Card, Divider, Row, Screen, T } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Nutrients() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { from = todayKey(), to = todayKey() } = useLocalSearchParams<{ from?: string; to?: string }>();
  const [m, setM] = useState<Micros>({});
  const [days, setDays] = useState(1);

  useFocusEffect(
    useCallback(() => {
      microsByDay(db, from, to).then((byDay) => {
        let total: Micros = {};
        for (const v of byDay.values()) total = addMicros(total, v);
        const n = Math.max(byDay.size, 1);
        const avg: Micros = {};
        for (const [k, v] of Object.entries(total)) avg[k as keyof Micros] = (v ?? 0) / n;
        setM(avg);
        setDays(n);
      });
    }, [db, from, to]),
  );

  const section = (title: string, defs: NutrientDef[]) => (
    <Card>
      <T weight="700">{title}</T>
      {defs.map((d, i) => {
        const v = m[d.key] ?? 0;
        const pct = pctDV(d, v);
        const color = d.limit ? (pct > 100 ? t.danger : t.accent) : pct >= 80 ? t.accent : pct >= 40 ? t.warn : t.danger;
        return (
          <View key={d.key} style={{ gap: 4 }}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between', paddingTop: 6 }}>
              <T size={15}>{d.title}</T>
              <T size={14} dim>
                {fmt(v, v < 10 ? 1 : 0)} {d.unit} · {fmt(pct)}%{d.limit ? ` из макс. ${fmt(d.dv)}` : ''}
              </T>
            </Row>
            <Bar value={Math.min(pct, 100)} max={100} color={color} />
          </View>
        );
      })}
    </Card>
  );

  return (
    <Screen>
      <T dim size={13}>
        {from === to ? formatDay(from, true) : `${formatDay(from)} — ${formatDay(to, true)}, в среднем за ${days} дн.`}. Примерная оценка: по данным
        с этикетки, если они есть, иначе по типу продукта (справочник USDA). Быстрые записи без продукта не учитываются.
      </T>
      {section('Витамины', NUTRIENTS.filter((d) => d.group === 'vitamin'))}
      {section('Минералы', NUTRIENTS.filter((d) => d.group === 'mineral'))}
      {section('Сахар, клетчатка, жиры', NUTRIENTS.filter((d) => d.group === 'other'))}
    </Screen>
  );
}
