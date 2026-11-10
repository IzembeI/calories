import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addFoodEntry,
  customFoods,
  defaultPortion,
  favouriteFoods,
  foodUsage,
  listMeals,
  mealFoodId,
  logMeal,
  portion,
  recentFoods,
  saveFood,
  searchFoods,
  undoFoodEntry,
  type FoodInput,
  type FoodRow,
  type MealRow,
} from '@/db/repo';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/dates';
import { OffError, offSearch } from '@/lib/off';
import { tap } from '@/lib/haptics';
import { fmt, mealForNow, mealTitle, type MealType } from '@/lib/nutrition';
import { groupHits, variantsLabel, type Hit, type HitGroup } from '@/lib/search-groups';
import { Button, Divider, Empty, Field, IconButton, ListItem, Plus, Row, Segmented, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';
import { space, useTheme } from '@/ui/theme';

type Tab = 'recent' | 'fav' | 'mine';

const SOURCE_CHIP: Record<FoodRow['source'], string> = { builtin: 'база ✓', custom: 'мой', off: 'OFF' };

export default function AddFood() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { date, showToast } = useApp();
  const params = useLocalSearchParams<{ meal?: MealType }>();
  const [fallbackMeal] = useState(mealForNow);
  const meal = params.meal ?? fallbackMeal;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [local, setLocal] = useState<FoodRow[]>([]);
  const [list, setList] = useState<FoodRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [off, setOff] = useState<FoodInput[] | null>(null);
  const [offLoading, setOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const lastOffQuery = useRef('');
  const currentQuery = useRef('');
  const offReq = useRef(0);

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
      offReq.current++; // abandons an Open Food Facts request still in flight
      setOff(null);
      setOffError(null);
      setOffLoading(false);
    }
    currentQuery.current = query;
    if (query.length < 2) {
      setLocal([]);
      return;
    }
    // SQLite answers can come back out of order: drop any that arrive after this query was replaced
    let live = true;
    const id = setTimeout(
      () =>
        searchFoods(db, query).then((rows) => {
          if (live) setLocal(rows);
        }),
      150,
    );
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, db]);

  const runOff = async () => {
    const query = q.trim();
    if (query.length < 2) return;
    lastOffQuery.current = query;
    const req = ++offReq.current;
    // a late Open Food Facts answer for an older query or an older request must not land under the new text
    const stale = () => req !== offReq.current || currentQuery.current !== query;
    setOffLoading(true);
    setOffError(null);
    try {
      const hits = await offSearch(query);
      if (!stale()) setOff(hits);
    } catch (e) {
      if (stale()) return;
      setOffError(e instanceof OffError ? e.message : 'Не удалось выполнить поиск');
      setOff([]);
    } finally {
      if (req === offReq.current) setOffLoading(false);
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
    // repeats the last logged portion; never logged → the same default the food screen opens with
    const d = defaultPortion(f);
    try {
      const prev = await foodUsage(db, f.id);
      const id = await addFoodEntry(db, date, meal, f, d.grams, d.label);
      tap();
      showToast({
        text: `Добавлено: ${f.name} ${d.label ?? `${fmt(d.grams)} г`} · ${fmt(portion(f, d.grams).kcal)} ккал`,
        action: {
          label: 'Отменить',
          onPress: async () => {
            await undoFoodEntry(db, id, prev);
            loadTab();
          },
        },
      });
    } catch (e) {
      Alert.alert('Не удалось добавить', String(e instanceof Error ? e.message : e));
    }
  };

  const addMeal = (m: MealRow) =>
    // a dish weighed after cooking is logged by grams, like any food
    m.cooked_weight_g
      ? openFood(mealFoodId(m.id))
      : Alert.alert(m.name, `Добавить все продукты блюда (${fmt(m.kcal)} ккал) в «${mealTitle(meal)}»?`, [
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
  const grouped = useMemo(() => groupHits(local, off), [local, off]);
  const rows: HitGroup[] = searching ? grouped.local : list.map((f) => ({ key: f.id, head: { kind: 'local', f }, rest: [] }));

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const subtitle = (f: Pick<FoodRow, 'source' | 'brand' | 'kcal'>) => [SOURCE_CHIP[f.source], f.brand, `${fmt(f.kcal)} ккал / 100 г`].filter(Boolean).join(' · ');

  const hitRow = (h: Hit) =>
    h.kind === 'local' ? (
      <ListItem
        left={<FoodPic art={artFor(h.f.name, h.f.category)} />}
        title={h.f.name}
        subtitle={subtitle(h.f)}
        onPress={() => openFood(h.f.id)}
        right={<Plus a11y={`Быстро добавить ${h.f.name}`} onPress={() => quickAdd(h.f)} />}
      />
    ) : (
      <ListItem left={<FoodPic art={artFor(h.f.name, h.f.category)} />} title={h.f.name} subtitle={subtitle(h.f)} onPress={() => openOff(h.f)} />
    );

  const groupRow = (g: HitGroup) => {
    const open = expanded.has(g.key);
    return (
      <View>
        {hitRow(g.head)}
        {g.rest.length > 0 && (
          <View style={{ alignItems: 'flex-start', marginTop: -space.s }}>
            <IconButton
              label={open ? 'Свернуть' : variantsLabel(g.rest.length)}
              a11y={open ? 'Свернуть варианты' : `Показать ещё ${variantsLabel(g.rest.length).slice(1)}`}
              onPress={() => toggle(g.key)}
            />
          </View>
        )}
        {open &&
          g.rest.map((h, i) => (
            <View key={h.kind === 'local' ? h.f.id : `${h.f.barcode ?? h.f.name}-${i}`} style={{ paddingLeft: space.l }}>
              <Divider />
              {hitRow(h)}
            </View>
          ))}
      </View>
    );
  };

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
          <Button title="Скан" icon="scan" kind="secondary" onPress={() => router.push({ pathname: '/scanner', params: { meal } })} />
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
      </View>

      <FlatList
        data={rows}
        keyExtractor={(g) => g.key}
        extraData={expanded}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: 60 }}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => groupRow(item)}
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
                    left={<FoodPic art="plate" />}
                    title={m.name}
                    subtitle={m.cooked_weight_g ? `${fmt((m.kcal / m.cooked_weight_g) * 100)} ккал / 100 г · готового ${fmt(m.cooked_weight_g)} г` : `${m.items} прод. · ${fmt(m.kcal)} ккал`}
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
              art={tab === 'recent' ? 'plate' : tab === 'fav' ? 'strawberry' : 'porridge'}
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
                {off && grouped.off.length > 0 && (
                  <View>
                    <T weight="700">Open Food Facts</T>
                    {grouped.off.map((g, i) => (
                      <View key={g.key}>
                        {i > 0 && <Divider />}
                        {groupRow(g)}
                      </View>
                    ))}
                  </View>
                )}
                {off && off.length > 0 && grouped.off.length === 0 && (
                  <T dim size={14}>Совпадения из Open Food Facts объединены с результатами выше.</T>
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
