import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Icon, type IconName } from '@/ui/icons';
import { useTheme } from '@/ui/theme';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} size={24} color={color} />;

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
      <Tabs.Screen name="index" options={{ title: 'Дневник', headerShown: false, tabBarIcon: icon('diary') }} />
      <Tabs.Screen name="progress" options={{ title: 'Прогресс', tabBarIcon: icon('progress') }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль', tabBarIcon: icon('profile') }} />
    </Tabs>
  );
}
