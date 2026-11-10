import { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { customFoods, deleteFood, listMeals, mergeFoods, restoreFood, type FoodRow, type MealRow } from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { fmt } from '@/lib/nutrition';
import { Button, Card, Divider, Empty, Field, IconButton, ListItem, Row, Screen, Segmented, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';
import { sheet } from '@/ui/sheet';
import { useTheme } from '@/ui/theme';

type Sort = 'name' | 'recent';

export default function MyFoods() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { showToast } = useApp();
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  /** the duplicate being merged: the next tapped food absorbs it */
  const [merging, setMerging] = useState<FoodRow | null>(null);

  const load = useCallback(() => {
    customFoods(db).then(setFoods);
    listMeals(db).then(setMeals);
  }, [db]);
  useFocusEffect(load);

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const match = (name: string) => words.every((w) => name.toLowerCase().includes(w));
  const shownMeals = meals.filter((m) => match(m.name));
  const shownFoods = useMemo(() => {
    const list = foods.filter((f) => words.every((w) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(w)));
    return sort === 'recent' ? [...list].sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foods, q, sort]);

  const remove = async (f: FoodRow) => {
    await deleteFood(db, f.id);
    load();
    showToast({ text: `Удалено: ${f.name}`, action: { label: 'Отменить', onPress: async () => { await restoreFood(db, f.id); load(); } } });
  };

  const menu = async (f: FoodRow) => {
    const i = await sheet(f.name, ['Изменить', 'Создать похожий', 'Объединить с дублем…', 'Удалить'], 3);
    if (i === 0) router.push({ pathname: '/food-edit', params: { id: f.id } });
    if (i === 1) router.push({ pathname: '/food-edit', params: { copyFrom: f.id } });
    if (i === 2) setMerging(f);
    if (i === 3) remove(f);
  };

  const mergeInto = (keep: FoodRow) => {
    const dup = merging;
    if (!dup || dup.id === keep.id) return;
    Alert.alert('Объединить продукты?', `«${dup.name}» исчезнет из списка, а все записи дневника и блюда с ним перейдут на «${keep.name}». Калории в старых записях не изменятся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Объединить',
        onPress: async () => {
          await mergeFoods(db, keep.id, dup.id);
          setMerging(null);
          load();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Field value={q} onChangeText={setQ} placeholder="Поиск по своим продуктам и блюдам" autoCorrect={false} clearButtonMode="while-editing" />
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Блюда</T>
        <IconButton label="+ Блюдо" onPress={() => router.push('/meal-edit')} />
      </Row>
      <Card>
        {shownMeals.length === 0 ? <Empty text={meals.length ? 'Ничего не нашлось' : 'Блюд пока нет'} /> : null}
        {shownMeals.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Divider />}
            <ListItem
              left={<FoodPic art="plate" />}
              title={m.name}
              subtitle={m.cooked_weight_g ? `${fmt((m.kcal / m.cooked_weight_g) * 100)} ккал / 100 г готового` : `${m.items} прод. · ${fmt(m.kcal)} ккал`}
              onPress={() => router.push({ pathname: '/meal-edit', params: { id: m.id } })}
            />
          </View>
        ))}
      </Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Продукты</T>
        <IconButton label="+ Продукт" onPress={() => router.push('/food-edit')} />
      </Row>
      <Segmented
        options={[
          { value: 'name', title: 'А–Я' },
          { value: 'recent', title: 'Недавние' },
        ]}
        value={sort}
        onChange={setSort}
      />
      {merging ? (
        <Card style={{ backgroundColor: t.accentSoft }}>
          <T size={14}>
            Выберите продукт, который останется вместо «{merging.name}».
          </T>
          <Button small kind="ghost" title="Отмена" onPress={() => setMerging(null)} />
        </Card>
      ) : null}
      <Card>
        {shownFoods.length === 0 ? <Empty text={foods.length ? 'Ничего не нашлось' : 'Своих продуктов пока нет'} art="porridge" /> : null}
        {shownFoods.map((f, i) => (
          <View key={f.id} style={{ opacity: merging?.id === f.id ? 0.4 : 1 }}>
            {i > 0 && <Divider />}
            <ListItem
              left={<FoodPic art={artFor(f.name, f.category)} />}
              title={f.name}
              subtitle={`${fmt(f.kcal)} ккал · Б ${fmt(f.protein, 1)} Ж ${fmt(f.fat, 1)} У ${fmt(f.carbs, 1)} на 100 г`}
              onPress={() => (merging ? mergeInto(f) : router.push({ pathname: '/food-edit', params: { id: f.id } }))}
              onLongPress={() => menu(f)}
              right={merging ? undefined : <IconButton label="⋯" a11y={`Действия: ${f.name}`} color={t.textDim} onPress={() => menu(f)} />}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
