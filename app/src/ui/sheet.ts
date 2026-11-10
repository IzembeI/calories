import { ActionSheetIOS, Alert, Platform } from 'react-native';

/** Native action sheet as a promise: resolves with the index of the chosen option, or null on cancel. */
export function sheet(title: string, options: string[], destructiveIndex?: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...options, 'Отмена'], cancelButtonIndex: options.length, destructiveButtonIndex: destructiveIndex },
        (i) => resolve(i < options.length ? i : null),
      );
    } else {
      Alert.alert(title, undefined, [
        ...options.map((text, i) => ({ text, onPress: () => resolve(i) })),
        { text: 'Отмена', style: 'cancel' as const, onPress: () => resolve(null) },
      ]);
    }
  });
}
