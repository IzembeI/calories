import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { formatDay, todayKey } from '@/lib/dates';
import { NUTRIENTS, nutrientSources, richFoods, type NutrientKey } from '@/lib/micros';
import { fmt } from '@/lib/nutrition';
import { Bar, Card, Divider, Empty, ListItem, Row, Screen, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';
import { useTheme } from '@/ui/theme';

type Sources = Awaited<ReturnType<typeof nutrientSources>>;
type Rich = Awaited<ReturnType<typeof richFoods>>;

export default function NutrientScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { key, from = todayKey(), to = todayKey() } = useLocalSearchParams<{ key: NutrientKey; from?: string; to?: string }>();
  const def = NUTRIENTS.find((d) => d.key === key);
  const [sources, setSources] = useState<Sources | null>(null);
  const [rich, setRich] = useState<Rich>([]);

  useFocusEffect(
    useCallback(() => {
      nutrientSources(db, key, from, to).then(setSources);
      richFoods(db, key).then(setRich);
    }, [db, key, from, to]),
  );

  if (!def) return <Empty text="Нутриент не найден" />;
  const num = (v: number) => fmt(v, v < 10 ? 1 : 0);
  const total = (sources ?? []).reduce((s, x) => s + x.amount, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: def.title }} />
      <T dim size={13}>
        {from === to ? formatDay(from, true) : `${formatDay(from)} — ${formatDay(to, true)}`}. Значения примерные: оценка по типу и составу продукта.
      </T>
      <Card>
        <T weight="700">{def.limit ? 'Откуда набралось' : 'Что дало больше всего'}</T>
        {sources == null ? null : sources.length === 0 ? (
          <T dim size={14}>
            За этот период записей с продуктами нет.
          </T>
        ) : (
          sources.slice(0, 12).map((s, i) => (
            <View key={s.name} style={{ gap: 4 }}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: 'space-between', paddingTop: 6 }}>
                <T size={15} style={{ flex: 1 }} numberOfLines={2}>
                  {s.name}
                </T>
                <T dim size={14}>
                  ≈ {num(s.amount)} {def.unit} · {fmt((s.amount / total) * 100)}%
                </T>
              </Row>
              <Bar value={s.amount} max={total} color={def.limit ? t.warn : t.accent} />
            </View>
          ))
        )}
      </Card>
      {!def.limit ? (
        <Card>
          <T weight="700">Где взять ещё</T>
          <T dim size={13}>
            Самые богатые из встроенных, ваших и уже записанных продуктов, на 100 г.
          </T>
          {rich.map((f, i) => (
            <View key={f.id}>
              {i > 0 && <Divider />}
              <ListItem
                left={<FoodPic art={artFor(f.name)} size={36} />}
                title={f.name}
                subtitle={`≈ ${num(f.per100)} ${def.unit} на 100 г · ${num(f.per100kcal)} на 100 ккал`}
                onPress={() => router.push({ pathname: '/food/[id]', params: { id: f.id } })}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
