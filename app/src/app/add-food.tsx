import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addFoodEntry,
  customFoods,
  favouriteFoods,
  listMeals,
  logMeal,
  recentFoods,
  saveFood,
  searchFoods,
  servingsOf,
  type FoodInput,
  type FoodRow,
  type MealRow,
} from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { OffError, offSearch } from '@/lib/off';
import { fmt, mealTitle, type MealType } from '@/lib/nutrition';
import { Button, Divider, Empty, Field, IconButton, ListItem, Plus, Row, Segmented, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

type Tab = 'recent' | 'fav' | 'mine';

export default function AddFood() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { date } = useApp();
  const { meal = 'breakfast' } = useLocalSearchParams<{ meal: MealType }>();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [local, setLocal] = useState<FoodRow[]>([]);
  const [list, setList] = useState<FoodRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [off, setOff] = useState<FoodInput[] | null>(null);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const lastOffQuery = useRef('');

  const loadTab = useCallback(async () => {
    if (tab === 'recent') setList(await recentFoods(db));
    if (tab === 'fav') setList(await favouriteFoods(db));
    if (tab === 'mine') {
      setList(await customFoods(db));
      setMeals(await listMeals(db));
    }
  }, [db, tab]);

  useFocusEffect(
    useCallback(() => {
      loadTab();
    }, [loadTab]),
  );

  useEffect(() => {
    const query = q.trim();
    if (query !== lastOffQuery.current) {
      setOff(null);
      setOffError(null);
    }
    if (query.length < 2) {
      setLocal([]);
      return;
    }
    const id = setTimeout(() => searchFoods(db, query).then(setLocal), 150);
    return () => clearTimeout(id);
  }, [q, db]);

  const runOff = async () => {
    const query = q.trim();
    if (query.length < 2) return;
    lastOffQuery.current = query;
    setOffLoading(true);
    setOffError(null);
    try {
      setOff(await offSearch(query));
    } catch (e) {
      setOffError(e instanceof OffError ? e.message : 'Не удалось выполнить поиск');
      setOff([]);
    } finally {
      setOffLoading(false);
    }
  };

  const openFood = (id: string) => router.push({ pathname: '/food/[id]', params: { id, meal } });

  const openOff = async (f: FoodInput) => {
    try {
      openFood(await saveFood(db, f));
    } catch (e) {
      Alert.alert('Не удалось открыть продукт', String(e instanceof Error ? e.message : e));
    }
  };

  const quickAdd = async (f: FoodRow) => {
    const s = servingsOf(f)[0];
    await addFoodEntry(db, date, meal, f, s ? s.grams : 100, s ? `1 ${s.name}` : null);
    setAdded(`${f.name}: ${s ? `1 ${s.name}` : '100 г'} добавлено`);
    setTimeout(() => setAdded(null), 1800);
  };

  const addMeal = (m: MealRow) =>
    Alert.alert(m.name, `Добавить все продукты блюда (${fmt(m.kcal)} ккал) в «${mealTitle(meal)}»?`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Добавить',
        onPress: async () => {
          await logMeal(db, m.id, date, meal);
          router.back();
        },
      },
    ]);

  const searching = q.trim().length >= 2;
  const rows = searching ? local : list;

  const foodRow = (f: FoodRow) => (
    <ListItem
      title={f.name}
      subtitle={[f.brand, `${fmt(f.kcal)} ккал / 100 г`, f.source === 'custom' ? 'мой' : null].filter(Boolean).join(' · ')}
      onPress={() => openFood(f.id)}
      right={<Plus onPress={() => quickAdd(f)} />}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: `${mealTitle(meal)} · ${formatDay(date)}` }} />
      <View style={{ padding: space.l, gap: space.m }}>
        <Row>
          <Field
            style={{ flex: 1 }}
            value={q}
            onChangeText={setQ}
            placeholder="Поиск продукта"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={runOff}
            clearButtonMode="while-editing"
          />
          <Button title="▥ Скан" kind="secondary" onPress={() => router.push({ pathname: '/scanner', params: { meal } })} />
        </Row>
        {!searching && (
          <Segmented
            options={[
              { value: 'recent', title: 'Недавние' },
              { value: 'fav', title: 'Избранное' },
              { value: 'mine', title: 'Мои' },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}
        {added ? (
          <T color={t.accent} size={14} weight="600">
            ✓ {added}
          </T>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 60 }}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => foodRow(item)}
        ListHeaderComponent={
          !searching && tab === 'mine' ? (
            <View style={{ gap: space.s, paddingBottom: space.m }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700">Мои блюда</T>
                <IconButton label="+ Блюдо" onPress={() => router.push('/meal-edit')} />
              </Row>
              {meals.length === 0 ? (
                <T dim size={14}>
                  Блюдо — это набор продуктов, который можно добавить одним нажатием.
                </T>
              ) : (
                meals.map((m) => (
                  <ListItem
                    key={m.id}
                    title={m.name}
                    subtitle={`${m.items} прод. · ${fmt(m.kcal)} ккал`}
                    onPress={() => addMeal(m)}
                    onLongPress={() => router.push({ pathname: '/meal-edit', params: { id: m.id } })}
                    right={<IconButton label="✎" onPress={() => router.push({ pathname: '/meal-edit', params: { id: m.id } })} />}
                  />
                ))
              )}
              <Row style={{ justifyContent: 'space-between', marginTop: space.m }}>
                <T weight="700">Мои продукты</T>
                <IconButton label="+ Продукт" onPress={() => router.push({ pathname: '/food-edit', params: { meal } })} />
              </Row>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          searching ? (
            <T dim size={14} style={{ paddingVertical: space.m }}>
              В своей базе ничего не нашлось.
            </T>
          ) : (
            <Empty
              text={
                tab === 'recent'
                  ? 'Здесь появятся продукты, которые вы добавляли.'
                  : tab === 'fav'
                    ? 'Отметьте продукт звёздочкой, чтобы он был здесь.'
                    : 'Своих продуктов пока нет.'
              }
            />
          )
        }
        ListFooterComponent={
          <View style={{ gap: space.m, paddingTop: space.m }}>
            {searching && (
              <>
                {off === null && !offLoading && (
                  <Button title={`Искать «${q.trim()}» в Open Food Facts`} kind="secondary" onPress={runOff} />
                )}
                {offLoading && <ActivityIndicator color={t.accent} />}
                {offError ? <T color={t.danger}>{offError}</T> : null}
                {off && off.length > 0 && (
                  <View>
                    <T weight="700">Open Food Facts</T>
                    {off.map((f, i) => (
                      <View key={f.barcode ?? `${f.name}-${i}`}>
                        {i > 0 && <Divider />}
                        <ListItem
                          title={f.name}
                          subtitle={[f.brand, `${fmt(f.kcal)} ккал / 100 г`].filter(Boolean).join(' · ')}
                          onPress={() => openOff(f)}
                        />
                      </View>
                    ))}
                  </View>
                )}
                {off && off.length === 0 && !offError && <T dim>В Open Food Facts тоже ничего не нашлось.</T>}
              </>
            )}
            <Row>
              <Button title="Быстро: ккал" kind="ghost" onPress={() => router.push({ pathname: '/quick-add', params: { meal } })} style={{ flex: 1 }} />
              <Button
                title="Создать продукт"
                kind="ghost"
                onPress={() => router.push({ pathname: '/food-edit', params: { name: q.trim(), meal } })}
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        }
      />
    </View>
  );
}
