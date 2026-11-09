import { Pressable, ScrollView, View } from 'react-native';
import type { Serving } from '@/db/repo';
import { fmt, MEALS, type MealType } from '@/lib/nutrition';
import { Card, Divider, NumField, Row, T } from './components';
import { radius, space, useTheme } from './theme';

/** Unit chips: grams plus each named serving. `unit` = null means grams. */
export function PortionPicker({
  servings,
  unit,
  onUnit,
  amount,
  onAmount,
}: {
  servings: Serving[];
  unit: Serving | null;
  onUnit: (s: Serving | null) => void;
  amount: string;
  onAmount: (s: string) => void;
}) {
  const t = useTheme();
  const chips: (Serving | null)[] = [null, ...servings];
  return (
    <View style={{ gap: space.s }}>
      <NumField
        label={unit ? `Количество (${unit.name} = ${fmt(unit.grams)} г)` : 'Количество'}
        value={amount}
        onChangeText={onAmount}
        suffix={unit ? unit.name : 'г'}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
        {chips.map((s) => {
          const active = (s === null && unit === null) || (s && unit && s.name === unit.name && s.grams === unit.grams);
          return (
            <Pressable
              key={s ? `${s.name}-${s.grams}` : 'g'}
              onPress={() => {
                onUnit(s);
                onAmount(s ? '1' : '100');
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.m,
                backgroundColor: active ? t.accent : t.input,
              }}
            >
              <T size={14} color={active ? t.onAccent : t.text}>
                {s ? `${s.name} · ${fmt(s.grams)} г` : 'граммы'}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MealPicker({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  const t = useTheme();
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      {MEALS.map((m) => (
        <Pressable
          key={m.type}
          onPress={() => onChange(m.type)}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.m, backgroundColor: value === m.type ? t.accent : t.input }}
        >
          <T size={14} color={value === m.type ? t.onAccent : t.text}>
            {m.title}
          </T>
        </Pressable>
      ))}
    </Row>
  );
}

export function NutrientCard({
  kcal,
  protein,
  fat,
  carbs,
  extra,
  title,
}: {
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  extra?: { label: string; value: number | null; unit?: string }[];
  title?: string;
}) {
  const t = useTheme();
  const cell = (label: string, v: number | null, color: string, unit = 'г') => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T size={18} weight="700" color={color}>
        {v == null ? '—' : `${fmt(v, 1)}${unit === 'г' ? ' г' : ''}`}
      </T>
      <T dim size={12}>
        {label}
      </T>
    </View>
  );
  return (
    <Card>
      {title ? (
        <T dim size={13}>
          {title}
        </T>
      ) : null}
      <Row>
        {cell('ккал', kcal, t.text, '')}
        {cell('белки', protein, t.protein)}
        {cell('жиры', fat, t.fat)}
        {cell('углеводы', carbs, t.carbs)}
      </Row>
      {extra && extra.some((e) => e.value != null) ? (
        <>
          <Divider />
          {extra.map((e) =>
            e.value == null ? null : (
              <Row key={e.label} style={{ justifyContent: 'space-between' }}>
                <T dim size={14}>
                  {e.label}
                </T>
                <T size={14}>
                  {fmt(e.value, 1)} {e.unit ?? 'г'}
                </T>
              </Row>
            ),
          )}
        </>
      ) : null}
    </Card>
  );
}
