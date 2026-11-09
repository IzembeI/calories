import { useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addQuickEntry, deleteEntry } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { fmt, parseNum, type MealType } from '@/lib/nutrition';
import { Button, Field, NumField, Row, Screen, T } from '@/ui/components';
import { MealPicker } from '@/ui/portion';

export default function QuickAdd() {
  const db = useSQLiteContext();
  const { date, showToast } = useApp();
  const params = useLocalSearchParams<{ meal?: MealType }>();
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'snack');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [f, setF] = useState('');
  const [c, setC] = useState('');
  const [saving, setSaving] = useState(false);
  const k = parseNum(kcal);

  const save = async () => {
    if (k == null || k <= 0 || saving) return;
    setSaving(true);
    const title = name.trim() || 'Быстрое добавление';
    try {
      const id = await addQuickEntry(db, date, meal, title, {
        kcal: k,
        protein: parseNum(p) ?? 0,
        fat: parseNum(f) ?? 0,
        carbs: parseNum(c) ?? 0,
      });
      router.dismissTo('/');
      showToast({ text: `Добавлено: ${title} · ${fmt(k)} ккал`, action: { label: 'Отменить', onPress: () => deleteEntry(db, id) } });
    } catch (e) {
      setSaving(false);
      Alert.alert('Не удалось добавить', String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <Screen>
      <T dim>{formatDay(date)}</T>
      <NumField label="Калории" suffix="ккал" value={kcal} onChangeText={setKcal} autoFocus />
      <Field label="Название (необязательно)" value={name} onChangeText={setName} placeholder="Например, обед в кафе" />
      <Row>
        <NumField style={{ flex: 1 }} label="Белки" suffix="г" value={p} onChangeText={setP} />
        <NumField style={{ flex: 1 }} label="Жиры" suffix="г" value={f} onChangeText={setF} />
        <NumField style={{ flex: 1 }} label="Углеводы" suffix="г" value={c} onChangeText={setC} />
      </Row>
      <MealPicker value={meal} onChange={setMeal} />
      <Button title="Добавить" onPress={save} disabled={k == null || k <= 0} loading={saving} />
    </Screen>
  );
}
