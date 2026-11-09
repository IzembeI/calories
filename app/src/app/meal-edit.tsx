import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteMeal, getMeal, portion, saveMeal, searchFoods, type FoodRow } from '@/db/repo';
import { fmt, parseNum } from '@/lib/nutrition';
import { Button, Card, Divider, Field, IconButton, ListItem, NumField, Row, Screen, T } from '@/ui/components';
import { NutrientCard } from '@/ui/portion';
import { useTheme } from '@/ui/theme';

interface Item {
  food: Pick<FoodRow, 'id' | 'name' | 'kcal' | 'protein' | 'fat' | 'carbs'>;
  grams: string;
}

export default function MealEdit() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FoodRow[]>([]);

  useEffect(() => {
    if (!id) return;
    getMeal(db, id).then((m) => {
      if (!m) return;
      setName(m.name);
      setItems(m.items.map((i) => ({ food: { id: i.food_id, name: i.name, kcal: i.kcal, protein: i.protein, fat: i.fat, carbs: i.carbs }, grams: String(i.grams) })));
    });
  }, [db, id]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const h = setTimeout(() => searchFoods(db, q, 15).then(setResults), 150);
    return () => clearTimeout(h);
  }, [q, db]);

  const totals = items.reduce(
    (a, it) => {
      const n = portion(it.food, parseNum(it.grams) ?? 0);
      return { kcal: a.kcal + n.kcal, protein: a.protein + n.protein, fat: a.fat + n.fat, carbs: a.carbs + n.carbs };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const valid = name.trim() && items.length > 0 && items.every((i) => (parseNum(i.grams) ?? 0) > 0);

  const save = async () => {
    if (!valid) return;
    await saveMeal(db, id ?? null, name.trim(), items.map((i) => ({ food_id: i.food.id, grams: parseNum(i.grams)! })));
    router.back();
  };

  const remove = () =>
    Alert.alert('Удалить блюдо?', name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(db, id!);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Field label="Название блюда" value={name} onChangeText={setName} placeholder="Например, мой завтрак" />
      <NutrientCard title="Всего" {...totals} />
      <Card>
        <T weight="700">Состав</T>
        {items.length === 0 ? <T dim size={14}>Найдите продукты ниже и добавьте их.</T> : null}
        {items.map((it, i) => (
          <Row key={`${it.food.id}-${i}`}>
            <View style={{ flex: 1 }}>
              <T numberOfLines={1}>{it.food.name}</T>
              <T dim size={12}>
                {fmt(portion(it.food, parseNum(it.grams) ?? 0).kcal)} ккал
              </T>
            </View>
            <NumField
              style={{ width: 90 }}
              value={it.grams}
              suffix="г"
              onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, grams: v } : x)))}
            />
            <IconButton label="✕" color={t.danger} onPress={() => setItems(items.filter((_, j) => j !== i))} />
          </Row>
        ))}
      </Card>
      <Field value={q} onChangeText={setQ} placeholder="Добавить продукт: поиск" autoCorrect={false} />
      {results.map((f, i) => (
        <View key={f.id}>
          {i > 0 && <Divider />}
          <ListItem
            title={f.name}
            subtitle={`${fmt(f.kcal)} ккал / 100 г`}
            onPress={() => {
              setItems([...items, { food: f, grams: '100' }]);
              setQ('');
            }}
            right={<T color={t.accent}>+</T>}
          />
        </View>
      ))}
      <Button title="Сохранить блюдо" onPress={save} disabled={!valid} />
      {id ? <Button title="Удалить блюдо" kind="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
