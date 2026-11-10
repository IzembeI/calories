import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { currentWeight } from '@/db/repo';
import { useProfile } from '@/lib/app-state';
import { ageFrom, todayKey } from '@/lib/dates';
import { ACTIVITY_LEVELS, GOALS, bmi, fmt, macroTargets } from '@/lib/nutrition';
import { Card, Divider, ListItem, Row, Screen, T } from '@/ui/components';
import { Icon, type IconName } from '@/ui/icons';
import { useTheme } from '@/ui/theme';

export default function ProfileTab() {
  const db = useSQLiteContext();
  const t = useTheme();
  const p = useProfile();
  const [w, setW] = useState(p.start_weight_kg);
  useFocusEffect(
    useCallback(() => {
      currentWeight(db, p, todayKey()).then(setW);
    }, [db, p]),
  );
  const m = macroTargets(p, w);
  const go = (path: '/goals' | '/export' | '/settings' | '/my-foods' | '/measurements') => () => router.push(path);
  const chevron = <Icon name="chevRight" size={18} color={t.textDim} />;
  const badge = (name: IconName) => (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={20} />
    </View>
  );

  return (
    <Screen>
      <Card>
        <Row style={{ justifyContent: 'space-around' }}>
          <Stat label="вес" value={`${fmt(w, 1)} кг`} />
          <Stat label="цель" value={`${fmt(p.target_weight_kg, 1)} кг`} />
          <Stat label="ИМТ" value={fmt(bmi(w, p.height_cm), 1)} />
        </Row>
        <Divider />
        <T dim size={13}>
          {GOALS.find((g) => g.value === p.goal)?.title} · {p.sex === 'male' ? 'мужчина' : 'женщина'}, {ageFrom(p.birth_date)} лет, {fmt(p.height_cm)} см ·
          активность: {ACTIVITY_LEVELS.find((a) => a.value === p.activity_level)?.title.toLowerCase()}
        </T>
        <T>
          <T weight="700" color={t.accent}>
            {fmt(p.kcal_goal)} ккал
          </T>{' '}
          · Б {m.protein} г · Ж {m.fat} г · У {m.carbs} г
        </T>
      </Card>
      <Card>
        <ListItem left={badge('target')} title="Цели и данные" subtitle="Норма калорий, БЖУ, вес" onPress={go('/goals')} right={chevron} />
        <Divider />
        <ListItem left={badge('ruler')} title="Замеры тела" subtitle="Вес и объёмы за выбранный день" onPress={go('/measurements')} right={chevron} />
        <Divider />
        <ListItem left={badge('doc')} title="Экспорт в PDF и CSV" subtitle="Дневник питания и замеры за период, таблицы для Excel" onPress={go('/export')} right={chevron} />
        <Divider />
        <ListItem left={badge('bookmark')} title="Мои продукты и блюда" onPress={go('/my-foods')} right={chevron} />
        <Divider />
        <ListItem left={badge('sliders')} title="Настройки" subtitle="Напоминания, резервная копия" onPress={go('/settings')} right={chevron} />
      </Card>
      <T dim size={12} center>
        Все данные хранятся только на этом iPhone. База продуктов — встроенная и Open Food Facts (ODbL).
      </T>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <T size={18} weight="700">
        {value}
      </T>
      <T dim size={12}>
        {label}
      </T>
    </View>
  );
}
