import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteEntry, getEntry, getFood, servingsOf, updateEntryGrams, updateQuickEntry, type Entry, type Serving } from '@/db/repo';
import { formatDay } from '@/lib/dates';
import { parseNum, type MealType } from '@/lib/nutrition';
import { Button, Empty, Field, NumField, Row, Screen, T, Title } from '@/ui/components';
import { MealPicker, NutrientCard, PortionPicker } from '@/ui/portion';

export default function EditEntry() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<Entry | null | undefined>(undefined);
  const [servings, setServings] = useState<Serving[]>([]);
  const [unit, setUnit] = useState<Serving | null>(null);
  const [amount, setAmount] = useState('');
  const [meal, setMeal] = useState<MealType>('breakfast');
  // quick entries
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [f, setF] = useState('');
  const [c, setC] = useState('');

  useEffect(() => {
    (async () => {
      const entry = await getEntry(db, id);
      setE(entry);
      if (!entry) return;
      setMeal(entry.meal_type);
      if (entry.grams == null) {
        setName(entry.name);
        setKcal(String(Math.round(entry.kcal)));
        setP(String(Math.round(entry.protein)));
        setF(String(Math.round(entry.fat)));
        setC(String(Math.round(entry.carbs)));
        return;
      }
      const food = entry.food_id ? await getFood(db, entry.food_id) : null;
      const sv = food ? servingsOf(food) : [];
      setServings(sv);
      const m = entry.serving_label ? /^([\d.,]+)\s+(.+)$/.exec(entry.serving_label) : null;
      const s = m ? sv.find((x) => x.name === m[2]) : undefined;
      if (m && s) {
        setUnit(s);
        setAmount(m[1]);
      } else setAmount(String(entry.grams).replace('.', ','));
    })();
  }, [db, id]);

  if (e === undefined) return null;
  if (e === null) return <Empty text="Запись не найдена" />;

  const remove = () =>
    Alert.alert('Удалить запись?', e.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, e.id);
          router.back();
        },
      },
    ]);

  if (e.grams == null) {
    const save = async () => {
      await updateQuickEntry(db, e.id, meal, name.trim() || 'Быстрое добавление', {
        kcal: parseNum(kcal) ?? 0,
        protein: parseNum(p) ?? 0,
        fat: parseNum(f) ?? 0,
        carbs: parseNum(c) ?? 0,
      });
      router.back();
    };
    return (
      <Screen>
        <T dim>{formatDay(e.date)}</T>
        <Field label="Название" value={name} onChangeText={setName} />
        <NumField label="Калории" suffix="ккал" value={kcal} onChangeText={setKcal} />
        <Row>
          <NumField style={{ flex: 1 }} label="Белки" suffix="г" value={p} onChangeText={setP} />
          <NumField style={{ flex: 1 }} label="Жиры" suffix="г" value={f} onChangeText={setF} />
          <NumField style={{ flex: 1 }} label="Углеводы" suffix="г" value={c} onChangeText={setC} />
        </Row>
        <MealPicker value={meal} onChange={setMeal} />
        <Button title="Сохранить" onPress={save} />
        <Button title="Удалить" kind="ghost" onPress={remove} />
      </Screen>
    );
  }

  const qty = parseNum(amount) ?? 0;
  const grams = unit ? qty * unit.grams : qty;
  const k = e.grams ? grams / e.grams : 1;
  const save = async () => {
    if (grams <= 0) return;
    await updateEntryGrams(db, e, grams, unit ? `${amount} ${unit.name}` : null, meal);
    router.back();
  };

  return (
    <Screen>
      <Title>{e.name}</Title>
      <T dim>{formatDay(e.date)}</T>
      <PortionPicker servings={servings} unit={unit} onUnit={setUnit} amount={amount} onAmount={setAmount} />
      <NutrientCard title={`${Math.round(grams)} г`} kcal={e.kcal * k} protein={e.protein * k} fat={e.fat * k} carbs={e.carbs * k} />
      <MealPicker value={meal} onChange={setMeal} />
      <Button title="Сохранить" onPress={save} disabled={grams <= 0} />
      <Button title="Удалить" kind="ghost" onPress={remove} />
    </Screen>
  );
}
