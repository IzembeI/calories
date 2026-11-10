import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { categoryTitle, microsPer100, NUTRIENTS, partsText, pctDV, scaleMicros } from '@/lib/micros';
import { useApp } from '@/lib/app-state';
import { fmt } from '@/lib/nutrition';
import { Card, Divider, Row, T } from './components';
import { useTheme } from './theme';

type FoodLike = Parameters<typeof microsPer100>[0];

/** Vitamins, minerals and sugars in a portion, with % of the daily value. */
export function MicrosCard({ food, grams }: { food: FoodLike; grams: number }) {
  const t = useTheme();
  const { profile } = useApp();
  const [all, setAll] = useState(false);
  const { values, estimated, category, parts } = microsPer100(food);
  const m = scaleMicros(values, grams);
  const rows = NUTRIENTS.map((d) => ({ d, v: m[d.key] ?? 0, pct: pctDV(d, m[d.key], profile) }));
  const top = rows.filter((r) => r.d.group !== 'other' && !r.d.limit).sort((a, b) => b.pct - a.pct);
  const shown = all ? rows : [...rows.filter((r) => r.d.key === 'added_sugar' || r.d.key === 'sugar' || r.d.key === 'fiber'), ...top.slice(0, 6)];

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Витамины и минералы</T>
        <T dim size={12}>
          % нормы
        </T>
      </Row>
      <T dim size={12}>
        {!estimated ? 'по данным с этикетки' : parts ? `≈ оценка по составу: ${partsText(parts)}` : `≈ оценка по типу «${categoryTitle(category)}»`}
      </T>
      {shown.map(({ d, v, pct }, i) => (
        <View key={d.key}>
          {i > 0 && <Divider />}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={14}>{d.title}</T>
            <T size={14} color={d.limit && pct > 30 ? t.warn : pct >= 15 ? t.accent : t.textDim}>
              {fmt(v, v < 10 ? 1 : 0)} {d.unit} · {fmt(pct)}%
            </T>
          </Row>
        </View>
      ))}
      <Pressable onPress={() => setAll((x) => !x)} hitSlop={8} accessibilityRole="button">
        <T color={t.accent} weight="600" size={14}>
          {all ? 'Свернуть' : 'Показать все'}
        </T>
      </Pressable>
    </Card>
  );
}
