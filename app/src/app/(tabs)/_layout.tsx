import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '@/ui/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textDim,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Дневник', headerShown: false, tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="progress" options={{ title: 'Прогресс', tabBarIcon: icon('↗') }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}
