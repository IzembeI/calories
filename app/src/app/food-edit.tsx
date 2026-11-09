import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteFood, getFood, saveFood, servingsOf, type Serving } from '@/db/repo';
import { fmt, parseNum, type MealType } from '@/lib/nutrition';
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
  const [sName, setSName] = useState('');
  const [sGrams, setSGrams] = useState('');

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
    });
  }, [db, params.id, params.copyFrom]);

  const kcalNum = parseNum(kcal);
  const pn = parseNum(p);
  const fn = parseNum(f);
  const cn = parseNum(c);
  const computed = (pn ?? 0) * 4 + (fn ?? 0) * 9 + (cn ?? 0) * 4;
  const valid = name.trim().length > 0 && kcalNum != null && kcalNum >= 0 && kcalNum <= 950;

  const save = async () => {
    if (!valid) return;
    try {
      const id = await saveFood(
        db,
        {
          source: 'custom',
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
      {kcalNum != null && computed > 0 && Math.abs(computed - kcalNum) > Math.max(30, kcalNum * 0.2) ? (
        <T size={13} color={t.warn}>
          По БЖУ выходит около {fmt(computed)} ккал — проверьте значения.
        </T>
      ) : null}
      <Row>
        <NumField style={{ flex: 1 }} label="Сахара" suffix="г" value={sugar} onChangeText={setSugar} />
        <NumField style={{ flex: 1 }} label="Клетчатка" suffix="г" value={fiber} onChangeText={setFiber} />
        <NumField style={{ flex: 1 }} label="Соль" suffix="г" value={salt} onChangeText={setSalt} />
      </Row>

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
