import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { useProfile } from '@/lib/app-state';
import { addDays, diffDays, formatDay, fromKey, toKey, todayKey } from '@/lib/dates';
import { buildPdf, sharePdf } from '@/lib/pdf';
import { exportCsv, type CsvDialect, type CsvKind } from '@/lib/csv';
import { Button, Card, Divider, Row, Screen, Segmented, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

type Preset = '7' | '30' | '90' | 'custom';

export default function Export() {
  const db = useSQLiteContext();
  const t = useTheme();
  const profile = useProfile();
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(addDays(todayKey(), -29));
  const [to, setTo] = useState(todayKey());
  const [diary, setDiary] = useState(true);
  const [detailed, setDetailed] = useState(true);
  const [meas, setMeas] = useState(true);
  const [charts, setCharts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ uri: string; pages: number } | null>(null);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [dialect, setDialect] = useState<CsvDialect>('excel');
  const [csvBusy, setCsvBusy] = useState<CsvKind | null>(null);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      setTo(todayKey());
      setFrom(addDays(todayKey(), -(Number(p) - 1)));
    }
  };

  const days = diffDays(from, to) + 1;

  const rangeOk = () => {
    if (from > to) {
      Alert.alert('Неверный период', 'Дата начала позже даты окончания.');
      return false;
    }
    return true;
  };

  const makeCsv = async (kind: CsvKind) => {
    if (!rangeOk()) return;
    setCsvBusy(kind);
    try {
      const rows = await exportCsv(db, profile, kind, from, to, dialect);
      if (!rows) Alert.alert('Нет данных', 'За выбранный период записей нет.');
    } catch (e) {
      Alert.alert('Не удалось создать CSV', String(e instanceof Error ? e.message : e));
    } finally {
      setCsvBusy(null);
    }
  };

  const make = async () => {
    if (!diary && !meas) return;
    if (!rangeOk()) return;
    setBusy(true);
    try {
      const res = await buildPdf(db, profile, { from, to, diary, diaryDetailed: detailed, measurements: meas, charts });
      setLast(res);
      await sharePdf(res.uri);
    } catch (e) {
      Alert.alert('Не удалось создать PDF', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (label: string, value: boolean, set: (v: boolean) => void, hint?: string, disabled?: boolean) => (
    <Row style={{ justifyContent: 'space-between', opacity: disabled ? 0.4 : 1 }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? (
          <T dim size={12}>
            {hint}
          </T>
        ) : null}
      </View>
      <Switch value={value} onValueChange={set} disabled={disabled} trackColor={{ true: t.accent }} />
    </Row>
  );

  return (
    <Screen>
      <T weight="700">Формат</T>
      <Segmented
        options={[
          { value: 'pdf', title: 'PDF' },
          { value: 'csv', title: 'CSV (Excel)' },
        ]}
        value={format}
        onChange={setFormat}
      />
      <T weight="700" style={{ marginTop: space.s }}>
        Период
      </T>
      <Segmented
        options={[
          { value: '7', title: '7 дней' },
          { value: '30', title: '30 дней' },
          { value: '90', title: '90 дней' },
          { value: 'custom', title: 'Свой' },
        ]}
        value={preset}
        onChange={applyPreset}
      />
      <Card>
        <Pressable onPress={() => { setPreset('custom'); setPicking(picking === 'from' ? null : 'from'); }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T dim>С</T>
            <T weight="600">{formatDay(from, true)}</T>
          </Row>
        </Pressable>
        {picking === 'from' && (
          <DateTimePicker value={fromKey(from)} mode="date" display="inline" locale="ru-RU" maximumDate={fromKey(to)} onChange={(_, d) => d && setFrom(toKey(d))} />
        )}
        <Divider />
        <Pressable onPress={() => { setPreset('custom'); setPicking(picking === 'to' ? null : 'to'); }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T dim>По</T>
            <T weight="600">{formatDay(to, true)}</T>
          </Row>
        </Pressable>
        {picking === 'to' && (
          <DateTimePicker value={fromKey(to)} mode="date" display="inline" locale="ru-RU" minimumDate={fromKey(from)} onChange={(_, d) => d && setTo(toKey(d))} />
        )}
      </Card>

      {format === 'csv' ? (
        <>
          <T weight="700" style={{ marginTop: space.s }}>
            Разделитель
          </T>
          <Segmented
            options={[
              { value: 'excel', title: 'Excel (;)' },
              { value: 'universal', title: 'Универсальный (,)' },
            ]}
            value={dialect}
            onChange={setDialect}
          />
          <T dim size={12}>
            {dialect === 'excel'
              ? 'Точка с запятой и десятичная запятая — для Excel с русскими настройками.'
              : 'Запятая и десятичная точка — для Google Таблиц, Numbers и других программ.'}
          </T>
          <T weight="700" style={{ marginTop: space.s }}>
            Файлы
          </T>
          <T dim size={12}>
            Каждый файл отправляется отдельно.
          </T>
          <Button title="Все записи с продуктами" onPress={() => makeCsv('entries')} loading={csvBusy === 'entries'} disabled={csvBusy != null} />
          <Button title="Итоги по дням" kind="secondary" onPress={() => makeCsv('days')} loading={csvBusy === 'days'} disabled={csvBusy != null} />
          <Button title="Замеры тела" kind="secondary" onPress={() => makeCsv('measurements')} loading={csvBusy === 'measurements'} disabled={csvBusy != null} />
        </>
      ) : (
        <>
          <T weight="700" style={{ marginTop: space.s }}>
            Что включить
          </T>
          <Card>
            {toggle('Дневник питания', diary, setDiary, 'Итоги по дням: калории, БЖУ, витамины и минералы')}
            <Divider />
            {toggle('Подробно по продуктам', detailed, setDetailed, days > 60 ? 'Для длинного периода PDF будет большим' : 'Каждый день: приёмы пищи и продукты', !diary)}
            <Divider />
            {toggle('Замеры тела', meas, setMeas, 'Вес, шея, грудь, бицепс, талия, ягодицы, бедро')}
            <Divider />
            {toggle('Графики', charts, setCharts, 'Калории по дням и динамика каждого замера')}
          </Card>

          <Button title="Создать PDF и отправить" onPress={make} loading={busy} disabled={!diary && !meas} />
          {last ? (
            <>
              <T dim size={13} center>
                Готово: {last.pages} стр.
              </T>
              <Button title="Отправить ещё раз" kind="ghost" onPress={() => sharePdf(last.uri)} />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
