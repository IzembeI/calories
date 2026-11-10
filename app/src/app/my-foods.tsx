import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { customFoods, listMeals, type FoodRow, type MealRow } from '@/db/repo';
import { fmt } from '@/lib/nutrition';
import { Card, Divider, Empty, IconButton, ListItem, Row, Screen, T } from '@/ui/components';
import { artFor, FoodPic } from '@/ui/icons';

export default function MyFoods() {
  const db = useSQLiteContext();
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [meals, setMeals] = useState<MealRow[]>([]);
  useFocusEffect(
    useCallback(() => {
      customFoods(db).then(setFoods);
      listMeals(db).then(setMeals);
    }, [db]),
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Блюда</T>
        <IconButton label="+ Блюдо" onPress={() => router.push('/meal-edit')} />
      </Row>
      <Card>
        {meals.length === 0 ? <Empty text="Блюд пока нет" /> : null}
        {meals.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Divider />}
            <ListItem left={<FoodPic art="plate" />} title={m.name} subtitle={`${m.items} прод. · ${fmt(m.kcal)} ккал`} onPress={() => router.push({ pathname: '/meal-edit', params: { id: m.id } })} />
          </View>
        ))}
      </Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700">Продукты</T>
        <IconButton label="+ Продукт" onPress={() => router.push('/food-edit')} />
      </Row>
      <Card>
        {foods.length === 0 ? <Empty text="Своих продуктов пока нет" art="porridge" /> : null}
        {foods.map((f, i) => (
          <View key={f.id}>
            {i > 0 && <Divider />}
            <ListItem
              left={<FoodPic art={artFor(f.name, f.category)} />}
              title={f.name}
              subtitle={`${fmt(f.kcal)} ккал · Б ${fmt(f.protein, 1)} Ж ${fmt(f.fat, 1)} У ${fmt(f.carbs, 1)} на 100 г`}
              onPress={() => router.push({ pathname: '/food-edit', params: { id: f.id } })}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
