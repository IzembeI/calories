import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteFood, getFood, saveFood, servingsOf, type FoodRow, type Serving } from '@/db/repo';
import { CATEGORIES, categoryTitle, guessCategory } from '@/lib/micros';
import { fmt, kcalCheck, kcalCheckText, parseNum, round1, type MealType } from '@/lib/nutrition';
import { Button, Card, Field, IconButton, NumField, Row, Screen, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export default function FoodEdit() {
  const db = useSQLiteContext();
  const t = useTheme();
  const params = useLocalSearchParams<{ id?: string; barcode?: string; name?: string; copyFrom?: string; meal?: MealType }>();
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [f, setF] = useState('');
  const [c, setC] = useState('');
  const [sugar, setSugar] = useState('');
  const [fiber, setFiber] = useState('');
  const [salt, setSalt] = useState('');
  const [servings, setServings] = useState<Serving[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [pickCat, setPickCat] = useState(false);
  const [sName, setSName] = useState('');
  const [sGrams, setSGrams] = useState('');
  // builtin / OFF product being corrected: keep its source and mark it edited
  const [origSource, setOrigSource] = useState<FoodRow['source'] | null>(null);

  useEffect(() => {
    const src = params.id ?? params.copyFrom;
    if (!src) return;
    getFood(db, src).then((food) => {
      if (!food) return;
      const s = (v: number | null) => (v == null ? '' : String(v));
      setName(food.name);
      setBrand(food.brand ?? '');
      setBarcode(params.copyFrom ? '' : food.barcode ?? '');
      setKcal(s(food.kcal));
      setP(s(food.protein));
      setF(s(food.fat));
      setC(s(food.carbs));
      setSugar(s(food.sugar));
      setFiber(s(food.fiber));
      setSalt(s(food.salt));
      setServings(servingsOf(food));
      setCategory(food.category);
      if (params.id) setOrigSource(food.source);
    });
  }, [db, params.id, params.copyFrom]);

  const kcalNum = parseNum(kcal);
  const pn = parseNum(p);
  const fn = parseNum(f);
  const cn = parseNum(c);
  const check =
    kcalNum != null ? kcalCheck({ name, category: category ?? guessCategory(name), kcal: kcalNum, protein: pn, fat: fn, carbs: cn, fiber: parseNum(fiber) }) : null;
  const correcting = origSource != null && origSource !== 'custom';
  const valid = name.trim().length > 0 && kcalNum != null && kcalNum >= 0 && kcalNum <= 950;

  const save = async () => {
    if (!valid) return;
    try {
      const id = await saveFood(
        db,
        {
          source: correcting ? origSource! : 'custom',
          barcode: barcode.trim() || null,
          name: name.trim(),
          brand: brand.trim() || null,
          kcal: kcalNum!,
          protein: pn,
          fat: fn,
          carbs: cn,
          sugar: parseNum(sugar),
          fiber: parseNum(fiber),
          salt: parseNum(salt),
          servings,
          category,
          ...(correcting ? { edited: 1 } : null),
        },
        params.id,
      );
      if (params.id) router.back();
      else router.replace({ pathname: '/food/[id]', params: { id, meal: params.meal ?? 'breakfast' } });
    } catch {
      Alert.alert('Не сохранено', 'Продукт с таким штрихкодом уже есть.');
    }
  };

  const addServing = () => {
    const g = parseNum(sGrams);
    if (!sName.trim() || !g || g <= 0) return;
    setServings([...servings, { name: sName.trim(), grams: g }]);
    setSName('');
    setSGrams('');
  };

  const remove = () =>
    Alert.alert('Удалить продукт?', 'Записи в дневнике останутся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteFood(db, params.id!);
          router.dismissTo('/');
        },
      },
    ]);

  return (
    <Screen>
      {correcting ? (
        <T dim size={13}>
          {origSource === 'off' ? 'Продукт из Open Food Facts' : 'Продукт из базы'}. Ваша правка сохранится и не будет перезаписана.
        </T>
      ) : null}
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например, сырники домашние" />
      <Field label="Производитель (необязательно)" value={brand} onChangeText={setBrand} />
      <Field label="Штрихкод (необязательно)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />
      <T weight="700" style={{ marginTop: space.s }}>
        На 100 г
      </T>
      <NumField label="Калории" suffix="ккал" value={kcal} onChangeText={setKcal} />
      <Row>
        <NumField style={{ flex: 1 }} label="Белки" suffix="г" value={p} onChangeText={setP} />
        <NumField style={{ flex: 1 }} label="Жиры" suffix="г" value={f} onChangeText={setF} />
        <NumField style={{ flex: 1 }} label="Углеводы" suffix="г" value={c} onChangeText={setC} />
      </Row>
      {check ? (
        <Card>
          <T size={13} color={t.warn}>
            {kcalCheckText(check)}
          </T>
          {check.kind === 'carbs_include_fiber' ? (
            <Button small title="Углеводы с клетчаткой → вычесть" kind="ghost" onPress={() => setC(String(check.carbs))} />
          ) : (
            <Button small title={`Пересчитать калории: ${fmt(check.est)} ккал`} kind="ghost" onPress={() => setKcal(String(round1(check.est)))} />
          )}
        </Card>
      ) : null}
      <Card>
        <Pressable onPress={() => setPickCat((v) => !v)} accessibilityRole="button" accessibilityLabel="Тип продукта">
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T>Тип продукта</T>
              <T dim size={12}>
                По нему примерно считаются витамины, минералы и сахар
              </T>
            </View>
            <T color={t.accent} weight="600">
              {categoryTitle(category ?? guessCategory(name))} ▾
            </T>
          </Row>
        </Pressable>
        {pickCat && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map((c) => {
              const active = (category ?? guessCategory(name)) === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    setCategory(c.key);
                    setPickCat(false);
                  }}
                  style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: active ? t.accent : t.input }}
                >
                  <T size={13} color={active ? t.onAccent : t.text}>
                    {c.title}
                  </T>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <T weight="700">Порции</T>
        {servings.length === 0 ? (
          <T dim size={14}>
            Например: «шт» = 60 г, «тарелка» = 300 г.
          </T>
        ) : (
          servings.map((s, i) => (
            <Row key={`${s.name}-${i}`} style={{ justifyContent: 'space-between' }}>
              <T>
                {s.name} — {fmt(s.grams)} г
              </T>
              <IconButton label="✕" color={t.danger} onPress={() => setServings(servings.filter((_, j) => j !== i))} />
            </Row>
          ))
        )}
        <Row>
          <Field style={{ flex: 2 }} placeholder="название" value={sName} onChangeText={setSName} />
          <NumField style={{ flex: 1 }} placeholder="г" value={sGrams} onChangeText={setSGrams} />
          <Pressable onPress={addServing} hitSlop={8}>
            <View style={{ paddingHorizontal: 10 }}>
              <T color={t.accent} weight="700" size={22}>
                +
              </T>
            </View>
          </Pressable>
        </Row>
      </Card>

      <Button title="Сохранить" onPress={save} disabled={!valid} />
      {params.id ? <Button title="Удалить продукт" kind="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
