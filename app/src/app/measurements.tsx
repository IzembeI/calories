import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { latestMeasurements, measurementsForDate, setMeasurement, type MeasurementRow } from '@/db/repo';
import { addDays, formatDay, formatShort, fromKey, toKey, todayKey } from '@/lib/dates';
import { MEASUREMENTS } from '@/lib/measurements';
import { fmt, parseNum } from '@/lib/nutrition';
import { Button, Card, Divider, IconButton, NumField, Row, Screen, T } from '@/ui/components';
import { useTheme } from '@/ui/theme';

/** Body measurements are weekly, so they have their own date (default: today), not the diary's day. */
export default function Measurements() {
  const db = useSQLiteContext();
  const t = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date ?? todayKey());
  const [picking, setPicking] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [prev, setPrev] = useState<Record<string, MeasurementRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const day = await measurementsForDate(db, date);
      const v = Object.fromEntries(day.map((m) => [m.type, String(m.value).replace('.', ',')]));
      setValues(v);
      setInitial(v);
      setPrev(await latestMeasurements(db, addDays(date, -1)));
    })();
  }, [db, date]);

  const save = async () => {
    setSaving(true);
    for (const m of MEASUREMENTS) {
      const now = values[m.type] ?? '';
      if (now === (initial[m.type] ?? '')) continue;
      await setMeasurement(db, date, m.type, parseNum(now));
    }
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Pressable onPress={() => setPicking((v) => !v)} accessibilityRole="button" accessibilityLabel="Изменить дату замеров">
          <Row style={{ justifyContent: 'space-between' }}>
            <T dim>Дата замеров</T>
            <T weight="600" color={t.accent}>
              {formatDay(date, true)}
            </T>
          </Row>
        </Pressable>
        {picking && (
          <DateTimePicker value={fromKey(date)} mode="date" display="inline" locale="ru-RU" maximumDate={new Date()} onChange={(_, d) => d && setDate(toKey(d))} />
        )}
      </Card>
      <T dim size={13}>
        Достаточно раз в неделю — в один день, утром, до еды.
      </T>
      <Card>
        {MEASUREMENTS.map((m, i) => {
          const p = prev[m.type];
          const cur = parseNum(values[m.type] ?? '');
          const delta = p && cur != null ? cur - p.value : null;
          return (
            <View key={m.type} style={{ gap: 4 }}>
              {i > 0 && <Divider />}
              <Row>
                <View style={{ flex: 1 }}>
                  <T>{m.title}</T>
                  {p ? (
                    <T dim size={12}>
                      было {fmt(p.value, 1)} {m.unit} ({formatShort(p.date)})
                      {delta != null && Math.abs(delta) >= 0.05 ? (
                        <T size={12} color={delta < 0 ? t.accent : t.warn}>
                          {'  '}
                          {delta > 0 ? '+' : ''}
                          {fmt(delta, 1)}
                        </T>
                      ) : null}
                    </T>
                  ) : null}
                </View>
                <NumField
                  style={{ width: 110 }}
                  value={values[m.type] ?? ''}
                  placeholder={p ? fmt(p.value, 1) : '—'}
                  suffix={m.unit}
                  onChangeText={(v) => setValues({ ...values, [m.type]: v })}
                />
                <IconButton label="↗" a11y={`История: ${m.title}`} onPress={() => router.push({ pathname: '/series/[type]', params: { type: m.type } })} />
              </Row>
            </View>
          );
        })}
      </Card>
      <T dim size={12}>
        Чтобы удалить значение, очистите поле и сохраните.
      </T>
      <Button title="Сохранить" onPress={save} loading={saving} />
    </Screen>
  );
}
