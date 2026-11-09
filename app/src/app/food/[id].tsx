import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addFoodEntry, getFood, portion, servingsOf, toggleFavourite, type FoodRow, type Serving } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { parseNum, type MealType } from '@/lib/nutrition';
import { Button, Empty, IconButton, Row, Screen, T, Title } from '@/ui/components';
import { MealPicker, NutrientCard, PortionPicker } from '@/ui/portion';

export default function FoodDetail() {
  const db = useSQLiteContext();
  const { date } = useApp();
  const params = useLocalSearchParams<{ id: string; meal?: MealType }>();
  const [food, setFood] = useState<FoodRow | null | undefined>(undefined);
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [unit, setUnit] = useState<Serving | null>(null);
  const [amount, setAmount] = useState('100');
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getFood(db, params.id).then((f) => {
        setFood(f);
        const s = f ? servingsOf(f)[0] : undefined;
        if (s && food === undefined) {
          setUnit(s);
          setAmount('1');
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, params.id]),
  );

  if (food === undefined) return null;
  if (food === null) return <Empty text="Продукт не найден" />;

  const qty = parseNum(amount) ?? 0;
  const grams = unit ? qty * unit.grams : qty;
  const n = portion(food, grams);

  const add = async () => {
    if (grams <= 0) return;
    setSaving(true);
    await addFoodEntry(db, date, meal, food, grams, unit ? `${amount} ${unit.name}` : null);
    router.dismissTo('/');
  };

  const fav = async () => {
    const on = await toggleFavourite(db, food.id);
    setFood({ ...food, favourite: on ? 1 : 0 });
  };

  const missing = food.protein == null || food.fat == null || food.carbs == null;

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Row>
              {food.source === 'custom' && (
                <IconButton label="✎" onPress={() => router.push({ pathname: '/food-edit', params: { id: food.id } })} />
              )}
              <IconButton label={food.favourite ? '★' : '☆'} onPress={fav} />
            </Row>
          ),
        }}
      />
      <Title>{food.name}</Title>
      {food.brand ? <T dim>{food.brand}</T> : null}
      {food.source === 'off' ? (
        <T dim size={12}>
          Данные Open Food Facts{food.barcode ? ` · ${food.barcode}` : ''}
          {missing ? ' · часть значений не указана' : ''}
        </T>
      ) : null}

      <PortionPicker servings={servingsOf(food)} unit={unit} onUnit={setUnit} amount={amount} onAmount={setAmount} />
      <NutrientCard title={`В порции (${Math.round(grams)} г)`} {...n} />
      <NutrientCard
        title="На 100 г"
        kcal={food.kcal}
        protein={food.protein}
        fat={food.fat}
        carbs={food.carbs}
        extra={[
          { label: 'Сахара', value: food.sugar },
          { label: 'Клетчатка', value: food.fiber },
          { label: 'Соль', value: food.salt },
        ]}
      />

      <T dim size={13}>
        Приём пищи · {formatDay(date)}
      </T>
      <MealPicker value={meal} onChange={setMeal} />
      <Button title="Добавить" onPress={add} disabled={grams <= 0} loading={saving} />
      {food.source === 'off' && missing ? (
        <Button
          title="Исправить значения"
          kind="ghost"
          onPress={() =>
            Alert.alert('Исправить продукт', 'Создать свой продукт на основе этого, чтобы вписать недостающие значения?', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Создать', onPress: () => router.push({ pathname: '/food-edit', params: { copyFrom: food.id } }) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
