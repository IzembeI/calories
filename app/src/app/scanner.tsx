import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getFoodByBarcode, saveFood } from '@/db/repo';
import { OffError, offByBarcode } from '@/lib/off';
import type { MealType } from '@/lib/nutrition';
import { Button, Row, Screen, T } from '@/ui/components';
import { space, useTheme } from '@/ui/theme';

export default function Scanner() {
  const db = useSQLiteContext();
  const t = useTheme();
  const { meal = 'breakfast' } = useLocalSearchParams<{ meal: MealType }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  if (!permission) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (!permission.granted) {
    return (
      <Screen>
        <T>Чтобы сканировать штрихкоды, разрешите доступ к камере.</T>
        {permission.canAskAgain ? (
          <Button title="Разрешить камеру" onPress={requestPermission} />
        ) : (
          <Button title="Открыть настройки" onPress={() => Linking.openSettings()} />
        )}
      </Screen>
    );
  }

  const handle = async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const unlock = () => {
      locked.current = false;
      setBusy(false);
    };
    try {
      const local = await getFoodByBarcode(db, code);
      if (local) {
        router.replace({ pathname: '/food/[id]', params: { id: local.id, meal } });
        return;
      }
      const f = await offByBarcode(code);
      if (f) {
        const id = await saveFood(db, f);
        router.replace({ pathname: '/food/[id]', params: { id, meal } });
        return;
      }
      Alert.alert('Продукт не найден', `Штрихкода ${code} нет в базе. Создать продукт вручную?`, [
        { text: 'Сканировать ещё', style: 'cancel', onPress: unlock },
        { text: 'Создать', onPress: () => router.replace({ pathname: '/food-edit', params: { barcode: code } }) },
      ]);
    } catch (e) {
      const msg = e instanceof OffError ? e.message : 'Не удалось проверить штрихкод';
      Alert.alert('Ошибка', `${msg}. Можно создать продукт вручную.`, [
        { text: 'Ещё раз', style: 'cancel', onPress: unlock },
        { text: 'Создать', onPress: () => router.replace({ pathname: '/food-edit', params: { barcode: code } }) },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
        onBarcodeScanned={(r) => handle(r.data)}
      />
      <View style={{ position: 'absolute', left: 0, right: 0, top: '35%', alignItems: 'center' }}>
        <View style={{ width: '75%', height: 140, borderWidth: 3, borderColor: '#fff', borderRadius: 16, opacity: 0.8 }} />
      </View>
      <View style={{ position: 'absolute', bottom: 40, left: space.l, right: space.l, gap: space.m }}>
        {busy ? <ActivityIndicator color="#fff" /> : <T color="#fff" center>Наведите камеру на штрихкод</T>}
        <Row>
          <Button title={torch ? 'Фонарик выкл.' : 'Фонарик'} kind="secondary" onPress={() => setTorch((v) => !v)} style={{ flex: 1 }} />
          <Button title="Ввести вручную" kind="secondary" onPress={() => router.replace({ pathname: '/food-edit', params: {} })} style={{ flex: 1 }} />
        </Row>
      </View>
    </View>
  );
}
