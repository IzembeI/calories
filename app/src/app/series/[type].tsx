import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteMeasurementById, series, type MeasurementRow } from '@/db/repo';
import { useProfile } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { measurementDef } from '@/lib/measurements';
import { fmt } from '@/lib/nutrition';
import { LineChart } from '@/ui/charts';
import { Card, Divider, Empty, IconButton, ListItem, Row, Screen, T } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Series() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const { type } = useLocalSearchParams<{ type: string }>();
  const def = measurementDef(type);
  const [rows, setRows] = useState<MeasurementRow[]>([]);

  const load = useCallback(() => {
    series(db, type).then(setRows);
  }, [db, type]);
  useFocusEffect(load);

  const first = rows[0];
  const last = rows[rows.length - 1];
  return (
    <Screen>
      <Stack.Screen options={{ title: def.title }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T dim size={13}>
              Сейчас
            </T>
            <T size={24} weight="800">
              {last ? `${fmt(last.value, 1)} ${def.unit}` : '—'}
            </T>
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
        <LineChart points={rows.map((r) => ({ date: r.date, value: r.value }))} target={type === 'weight' ? profile.target_weight_kg : null} />
      </Card>
      <Card>
        {rows.length === 0 ? <Empty text="Записей пока нет" /> : null}
        {[...rows].reverse().map((r, i) => (
          <View key={r.id}>
            {i > 0 && <Divider />}
            <ListItem
              title={`${fmt(r.value, 1)} ${def.unit}`}
              subtitle={formatDay(r.date, true)}
              right={
                <IconButton
                  label="✕"
                  color={t.danger}
                  onPress={() =>
                    Alert.alert('Удалить значение?', `${fmt(r.value, 1)} ${def.unit} — ${formatDay(r.date, true)}`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Удалить', style: 'destructive', onPress: () => deleteMeasurementById(db, r.id).then(load) },
                    ])
                  }
                />
              }
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
