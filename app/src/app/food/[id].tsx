import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addFoodEntry, defaultPortion, foodUsage, getFood, portion, saveFood, servingsOf, toggleFavourite, undoFoodEntry, type FoodRow, type Serving } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { guessCategory } from '@/lib/micros';
import { fmt, kcalCheck, kcalCheckText, parseNum, type MealType } from '@/lib/nutrition';
import { Button, Card, Empty, IconButton, Row, Screen, T, Title } from '@/ui/components';
import { MicrosCard } from '@/ui/micros-card';
import { MealPicker, NutrientCard, PortionPicker } from '@/ui/portion';
import { useTheme } from '@/ui/theme';

export default function FoodDetail() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { date, showToast } = useApp();
  const params = useLocalSearchParams<{ id: string; meal?: MealType }>();
  const [food, setFood] = useState<FoodRow | null | undefined>(undefined);
  const [meal, setMeal] = useState<MealType>(params.meal ?? 'breakfast');
  const [unit, setUnit] = useState<Serving | null>(null);
  const [amount, setAmount] = useState('100');
  const [saving, setSaving] = useState(false);
  /** grams of the last logged portion, shown as a hint while the amount still matches it */
  const [lastGrams, setLastGrams] = useState<number | null>(null);
  const initialised = useRef(false);

  useFocusEffect(
    useCallback(() => {
      getFood(db, params.id).then((f) => {
        setFood(f);
        if (f && !initialised.current) {
          const d = defaultPortion(f);
          setUnit(d.unit);
          setAmount(d.amount);
          setLastGrams(d.last ? d.grams : null);
        }
        initialised.current = true;
      });
    }, [db, params.id]),
  );

  if (food === undefined) return null;
  if (food === null) return <Empty text="Продукт не найден" />;

  const qty = parseNum(amount) ?? 0;
  const grams = unit ? qty * unit.grams : qty;
  const n = portion(food, grams);

  const add = async () => {
    if (grams <= 0 || saving) return;
    setSaving(true);
    const label = unit ? `${amount} ${unit.name}` : null;
    try {
      const prev = await foodUsage(db, food.id);
      const id = await addFoodEntry(db, date, meal, food, grams, label);
      router.dismissTo('/');
      showToast({
        text: `Добавлено: ${food.name} ${label ?? `${fmt(grams)} г`} · ${fmt(n.kcal)} ккал`,
        action: { label: 'Отменить', onPress: () => undoFoodEntry(db, id, prev) },
      });
    } catch (e) {
      setSaving(false);
      Alert.alert('Не удалось добавить', String(e instanceof Error ? e.message : e));
    }
  };

  const fav = async () => {
    const on = await toggleFavourite(db, food.id);
    setFood({ ...food, favourite: on ? 1 : 0 });
  };

  const missing = food.protein == null || food.fat == null || food.carbs == null;
  const edit = () => router.push({ pathname: '/food-edit', params: { id: food.id } });
  // the user's own and already corrected products are not nagged; the edit form still shows the hint
  const check =
    food.source !== 'custom' && !food.edited ? kcalCheck({ ...food, category: food.category ?? guessCategory(food.name) }) : null;

  const subtractFiber = async (carbs: number) => {
    await saveFood(db, { ...food, servings: servingsOf(food), carbs, edited: 1 }, food.id);
    setFood({ ...food, carbs, edited: 1 });
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Row>
              <IconButton label="✎" a11y="Исправить продукт" onPress={edit} />
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
          {food.edited ? ' · исправлено вами' : ''}
        </T>
      ) : food.source === 'builtin' && food.edited ? (
        <T dim size={12}>
          Исправлено вами
        </T>
      ) : null}
      {check ? (
        <Card>
          <T size={13} color={t.warn}>
            {kcalCheckText(check)}
          </T>
          {check.kind === 'carbs_include_fiber' ? (
            <Button small kind="ghost" title="Углеводы с клетчаткой → вычесть" onPress={() => subtractFiber(check.carbs)} />
          ) : (
            <Button small kind="ghost" title="Исправить" onPress={edit} />
          )}
        </Card>
      ) : null}

      <PortionPicker servings={servingsOf(food)} unit={unit} onUnit={setUnit} amount={amount} onAmount={setAmount} />
      {lastGrams != null && Math.abs(grams - lastGrams) <= Math.max(0.5, lastGrams * 0.01) ? (
        <T dim size={13}>
          Как в прошлый раз · {fmt(lastGrams)} г
        </T>
      ) : null}
      <NutrientCard title={`В порции (${Math.round(grams)} г)`} {...n} />
      <MicrosCard food={food} grams={grams} />
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
      {food.source !== 'custom' ? <Button title={missing ? 'Исправить значения' : 'Исправить'} kind="ghost" onPress={edit} /> : null}
    </Screen>
  );
}
