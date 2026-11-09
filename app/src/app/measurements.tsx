import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { latestMeasurements, measurementsForDate, setMeasurement, type MeasurementRow } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { addDays, formatDay, formatShort } from '@/lib/dates';
import { MEASUREMENTS } from '@/lib/measurements';
import { fmt, parseNum } from '@/lib/nutrition';
import { Button, Card, Divider, IconButton, NumField, Row, Screen, T } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function Measurements() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { date } = useApp();
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [prev, setPrev] = useState<Record<string, MeasurementRow>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const today = await measurementsForDate(db, date);
      const v = Object.fromEntries(today.map((m) => [m.type, String(m.value).replace('.', ',')]));
      setValues(v);
      setInitial(v);
      // previous values (before this day) as hints
      const before = await latestMeasurements(db, addDays(date, -1));
      setPrev(before);
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
      <T dim>
        {formatDay(date, true)}. Мерьте раз в неделю, в один и тот же день и в одинаковых условиях — например, утром до еды.
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
                <IconButton label="↗" onPress={() => router.push({ pathname: '/series/[type]', params: { type: m.type } })} />
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
