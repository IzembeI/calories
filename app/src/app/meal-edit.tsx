import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { deleteMeal, getMeal, getSetting, portion, saveMeal, searchFoods, setSetting, type FoodRow } from '@/db/repo';
import { fmt, parseNum } from '@/lib/nutrition';
import { Button, Card, Divider, Field, IconButton, ListItem, NumField, Row, Screen, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';
import { NutrientCard } from '@/ui/portion';
import { radius, space, useTheme } from '@/ui/theme';

/** Saved cookware: its empty weight is subtracted from the weight of the full pot. */
interface Pan { name: string; tare_g: number }

/** «гречка 200», «масло сливочное 15 г», «молоко — 250 мл» → name and grams. */
const LINE = /^(.+?)[\s—–:-]+(\d+(?:[.,]\d+)?)\s*(?:г|гр|g|мл|ml)?\.?$/i;

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
  const [gross, setGross] = useState('');
  const [tare, setTare] = useState('');
  const [pans, setPans] = useState<Pan[]>([]);
  const [listText, setListText] = useState<string | null>(null);

  useEffect(() => {
    getSetting<Pan[]>(db, 'pans', []).then(setPans);
  }, [db]);

  useEffect(() => {
    if (!id) return;
    getMeal(db, id).then((m) => {
      if (!m) return;
      setName(m.name);
      if (m.cooked_weight_g) setGross(String(m.cooked_weight_g).replace('.', ','));
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
  const rawWeight = items.reduce((a, it) => a + (parseNum(it.grams) ?? 0), 0);
  const grossN = parseNum(gross);
  /** net weight of the ready dish; null = not weighed, the dish is logged by its ingredients */
  const cooked = grossN != null && grossN > 0 ? grossN - (parseNum(tare) ?? 0) : null;
  const cookedOk = cooked == null || cooked > 0;
  const per100 = cooked && cooked > 0 ? { kcal: (totals.kcal / cooked) * 100, protein: (totals.protein / cooked) * 100, fat: (totals.fat / cooked) * 100, carbs: (totals.carbs / cooked) * 100 } : null;

  const save = async () => {
    if (!valid || !cookedOk) return;
    await saveMeal(db, id ?? null, name.trim(), items.map((i) => ({ food_id: i.food.id, grams: parseNum(i.grams)! })), cooked);
    router.back();
  };

  const savePan = () => {
    const g = parseNum(tare);
    if (!g || g <= 0) return Alert.alert('Сначала укажите вес пустой посуды');
    Alert.prompt('Название посуды', `Запомнить ${fmt(g)} г`, async (text) => {
      const title = text?.trim();
      if (!title) return;
      const next = [...pans.filter((p) => p.name !== title), { name: title, tare_g: g }];
      setPans(next);
      await setSetting(db, 'pans', next);
    });
  };

  const forgetPan = (p: Pan) =>
    Alert.alert(p.name, `${fmt(p.tare_g)} г`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Забыть посуду',
        style: 'destructive',
        onPress: async () => {
          const next = pans.filter((x) => x.name !== p.name);
          setPans(next);
          await setSetting(db, 'pans', next);
        },
      },
    ]);

  /** Adds ingredients from pasted lines; each line is matched to the best food found by its name. */
  const pasteList = async () => {
    const added: Item[] = [];
    const missed: string[] = [];
    for (const raw of (listText ?? '').split('\n')) {
      const line = raw.trim().replace(/^[-•*\d.)\s]+(?=\D)/, '');
      if (!line) continue;
      const m = LINE.exec(line);
      const found = m ? (await searchFoods(db, m[1].trim(), 1))[0] : undefined;
      if (m && found) added.push({ food: found, grams: m[2] });
      else missed.push(line);
    }
    if (added.length) setItems([...items, ...added]);
    setListText(missed.length ? missed.join('\n') : null);
    if (missed.length) Alert.alert('Не всё распознано', `Добавлено: ${added.length}. Остались строки, для которых не нашлось продукта или веса — поправьте их или добавьте вручную.`);
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
      {listText == null ? (
        <Button small kind="ghost" title="Вставить список текстом" onPress={() => setListText('')} />
      ) : (
        <Card>
          <T dim size={13}>
            По строке на продукт: название и граммы, например «гречка 200».
          </T>
          <Field value={listText} onChangeText={setListText} multiline placeholder={'свёкла 300\nкапуста 400\nговядина 500'} autoCorrect={false} />
          <Row>
            <Button small title="Добавить в состав" onPress={pasteList} disabled={!listText.trim()} style={{ flex: 1 }} />
            <Button small kind="ghost" title="Скрыть" onPress={() => setListText(null)} />
          </Row>
        </Card>
      )}
      {results.map((f, i) => (
        <View key={f.id}>
          {i > 0 && <Divider />}
          <ListItem
            left={<FoodPic art={artFor(f.name, f.category)} size={36} />}
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
      <Card>
        <T weight="700">Вес готового блюда</T>
        <T dim size={13}>
          Необязательно. Взвесьте готовое блюдо — и его можно будет записывать граммами, как обычный продукт: «350 г борща».
          {rawWeight > 0 ? ` Сырые продукты весят ${fmt(rawWeight)} г.` : ''}
        </T>
        <Row>
          <NumField style={{ flex: 1 }} label="Блюдо с посудой" value={gross} onChangeText={setGross} suffix="г" />
          <NumField style={{ flex: 1 }} label="Пустая посуда" value={tare} onChangeText={setTare} suffix="г" placeholder="0" />
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          {pans.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => setTare(String(p.tare_g))}
              onLongPress={() => forgetPan(p)}
              accessibilityRole="button"
              accessibilityLabel={`Посуда ${p.name}, ${fmt(p.tare_g)} граммов`}
              style={{ backgroundColor: t.accentSoft, borderRadius: radius.m, paddingVertical: 6, paddingHorizontal: space.m }}
            >
              <T size={14} color={t.accent}>
                {p.name} · {fmt(p.tare_g)} г
              </T>
            </Pressable>
          ))}
          <IconButton label="+ Запомнить посуду" onPress={savePan} />
        </Row>
        {!cookedOk ? (
          <T size={13} color={t.warn}>
            Посуда не может весить больше, чем блюдо вместе с ней.
          </T>
        ) : per100 ? (
          <T size={14}>
            Готового {fmt(cooked)} г. На 100 г: {fmt(per100.kcal)} ккал · Б {fmt(per100.protein, 1)} Ж {fmt(per100.fat, 1)} У {fmt(per100.carbs, 1)}
          </T>
        ) : null}
      </Card>
      <Button title="Сохранить блюдо" onPress={save} disabled={!valid || !cookedOk} />
      {id ? <Button title="Удалить блюдо" kind="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
