import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { migrate } from '@/db/migrations';
import { AppStateProvider, useApp } from '@/lib/app-state';
import { IconButton } from '@/ui/components';
import { useTheme } from '@/ui/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

function Nav() {
  const t = useTheme();
  const { profile, loaded } = useApp();
  if (!loaded) return <Loading />;
  const hasProfile = !!profile;

  const modal = {
    presentation: 'modal' as const,
    headerLeft: () => <IconButton label="Отмена" onPress={() => router.back()} />,
  };
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.accent,
          headerTitleStyle: { color: t.text },
          contentStyle: { backgroundColor: t.bg },
          headerShadowVisible: false,
          headerBackTitle: 'Назад',
        }}
      >
        <Stack.Protected guard={!hasProfile}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add-food" options={{ title: 'Добавить' }} />
        <Stack.Screen name="scanner" options={{ title: 'Штрихкод', ...modal }} />
        <Stack.Screen name="food/[id]" options={{ title: 'Продукт' }} />
        <Stack.Screen name="food-edit" options={{ title: 'Свой продукт', ...modal }} />
        <Stack.Screen name="meal-edit" options={{ title: 'Блюдо' }} />
        <Stack.Screen name="quick-add" options={{ title: 'Быстрое добавление', ...modal }} />
        <Stack.Screen name="entry/[id]" options={{ title: 'Запись' }} />
        <Stack.Screen name="measurements" options={{ title: 'Замеры' }} />
        <Stack.Screen name="activity" options={{ title: 'Активность', ...modal }} />
        <Stack.Screen name="series/[type]" options={{ title: 'История' }} />
        <Stack.Screen name="export" options={{ title: 'Экспорт в PDF' }} />
        <Stack.Screen name="goals" options={{ title: 'Цели и данные' }} />
        <Stack.Screen name="settings" options={{ title: 'Настройки' }} />
        <Stack.Screen name="my-foods" options={{ title: 'Мои продукты и блюда' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName="kalorii.db" onInit={migrate} useSuspense>
        <AppStateProvider>
          <Nav />
        </AppStateProvider>
      </SQLiteProvider>
    </Suspense>
  );
}
