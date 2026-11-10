// Light taps of the Taptic Engine. One switch in the settings turns all of them off.
// The flag lives in a module-level variable, loaded at startup by lib/app-state.tsx.
import * as Haptics from 'expo-haptics';

let enabled = true;
export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

const quiet = (p: Promise<void>) => p.catch(() => {}); // no Taptic Engine (old devices, simulator): never an error

/** Something was added or changed. */
export const tap = () => enabled && quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** A longer action finished well: a barcode was found. */
export const success = () => enabled && quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
