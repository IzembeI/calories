import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteMeasurementById, getSetting, measurementsBetween, series, setSetting, type MeasurementRow } from '@/db/repo';
import { useProfile } from '@/lib/app-state';
import { BODYFAT_METHOD_KEY, BODYFAT_TYPE, NAVY_ERROR_PCT, compositionSeries, type CompositionPoint } from '@/lib/body';
import { formatDay } from '@/lib/dates';
import { measurementDef } from '@/lib/measurements';
import { fmt } from '@/lib/nutrition';
import { TREND_FROM, formatPace, trendText, weightTrend } from '@/lib/trend';
import { BodyFatMethod } from '@/ui/body-card';
import { LineChart } from '@/ui/charts';
import { Card, Divider, Empty, IconButton, ListItem, Row, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export default function Series() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { type } = useLocalSearchParams<{ type: string }>();
  // 'bodyfat' is virtual: Navy estimate on dates with waist + neck (+ hips for women), read-only.
  const isBf = type === BODYFAT_TYPE;
  const def = isBf ? { title: 'Процент жира', unit: '%' } : measurementDef(type);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [comp, setComp] = useState<Map<string, CompositionPoint>>(new Map());
  const [methodOk, setMethodOk] = useState(true);

  const load = useCallback(() => {
    if (!isBf) {
      series(db, type).then(setRows);
      return;
    }
    (async () => {
      const ok = await getSetting(db, BODYFAT_METHOD_KEY, false);
      setMethodOk(ok);
      const pts = ok ? compositionSeries(await measurementsBetween(db, '0000-01-01', '9999-12-31'), profile.sex, profile.height_cm) : [];
      setComp(new Map(pts.map((c) => [c.date, c])));
      setRows(pts.map((c) => ({ id: c.date, date: c.date, type: 'waist', value: c.bf })));
    })();
  }, [db, type, isBf, profile.sex, profile.height_cm]);
  useFocusEffect(load);

  const first = rows[0];
  const last = rows[rows.length - 1];
  const history = useMemo(() => [...rows].reverse(), [rows]);
  const trend = useMemo(() => (type === 'weight' ? weightTrend(rows.map((r) => ({ date: r.date, value: r.value }))) : null), [type, rows]);
  const head = trend ? trendText(trend) : null;
  const masses = useMemo(() => {
    const pts = [...comp.values()].filter((c) => c.fatKg != null && c.leanKg != null);
    return {
      lean: pts.map((c) => ({ date: c.date, value: c.leanKg! })),
      fat: pts.map((c) => ({ date: c.date, value: c.fatKg! })),
    };
  }, [comp]);
  const remove = useCallback(
    (r: MeasurementRow) =>
      Alert.alert('Удалить значение?', `${fmt(r.value, 1)} ${def.unit} — ${formatDay(r.date, true)}`, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => deleteMeasurementById(db, r.id).then(load) },
      ]),
    [db, def.unit, load],
  );

  // Daily weigh-ins grow to hundreds of rows, so the history is virtualized.
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.l, paddingBottom: 48 }}
      contentInsetAdjustmentBehavior="automatic"
      data={history}
      keyExtractor={(r) => r.id}
      initialNumToRender={20}
      ItemSeparatorComponent={Divider}
      ListHeaderComponent={
        <View style={{ gap: space.m, marginBottom: space.m }}>
          <Stack.Screen options={{ title: def.title }} />
          {isBf && !methodOk ? (
            <Card>
              <BodyFatMethod
                sex={profile.sex}
                onConfirm={() => setSetting(db, BODYFAT_METHOD_KEY, true).then(load)}
              />
            </Card>
          ) : null}
          {isBf ? (
            <T dim size={13}>
              Оценка по формуле ВМС США (±{NAVY_ERROR_PCT}%) — по дням, когда в один день измерены талия, шея{profile.sex === 'female' ? ' и ягодицы' : ''}.
            </T>
          ) : null}
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T dim size={13}>
                  {head ? `Тренд ${head.note}` : 'Сейчас'}
                </T>
                <T size={24} weight="800">
                  {trend ? `${fmt(trend.value, 1)} ${def.unit}` : last ? `${fmt(last.value, 1)} ${def.unit}` : '—'}
                </T>
                {trend?.perWeek != null ? (
                  <T weight="600" color={t.accent}>
                    {formatPace(trend.perWeek)}
                  </T>
                ) : null}
              </View>
              {first && last && first !== last ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <T dim size={13}>
                    С {formatDay(first.date)}
                  </T>
                  <T size={18} weight="700" color={last.value <= first.value ? t.accent : t.warn}>
                    {last.value - first.value > 0 ? '+' : ''}
                    {fmt(last.value - first.value, 1)} {def.unit}
                  </T>
                </View>
              ) : null}
            </Row>
            <LineChart
              points={rows.map((r) => ({ date: r.date, value: r.value }))}
              trend={trend ? trend.series.slice(TREND_FROM).map((p) => ({ date: p.date, value: p.trend })) : undefined}
              target={type === 'weight' ? profile.target_weight_kg : null} />
          </Card>
          {isBf && masses.lean.length > 0 ? (
            <Card>
              <T dim size={13}>
                Без жира, кг
              </T>
              <LineChart points={masses.lean} />
              <T dim size={13}>
                Жир, кг
              </T>
              <LineChart points={masses.fat} />
            </Card>
          ) : null}
          <T weight="700">История</T>
        </View>
      }
      ListEmptyComponent={<Empty text="Записей пока нет" art="sunrise" />}
      renderItem={({ item: r }) => {
        const c = isBf ? comp.get(r.date) : undefined;
        return (
          <ListItem
            title={
              c?.fatKg != null && c.leanKg != null
                ? `${fmt(r.value, 1)} ${def.unit} · жир ${fmt(c.fatKg, 1)} кг · без жира ${fmt(c.leanKg, 1)} кг`
                : `${fmt(r.value, 1)} ${def.unit}`
            }
            subtitle={formatDay(r.date, true)}
            right={isBf ? undefined : <IconButton label="✕" color={t.danger} onPress={() => remove(r)} />}
          />
        );
      }}
    />
  );
}
