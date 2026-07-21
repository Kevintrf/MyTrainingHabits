import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/**
 * Cross-platform alert wrapper.
 * Uses React Native Alert on native, window.alert/confirm on web (for dev testing).
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const msg = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length <= 1) {
    window.alert(msg);
    buttons?.[0]?.onPress?.();
    return;
  }

  const nonCancel = buttons.filter((b) => b.style !== 'cancel');
  const cancel = buttons.find((b) => b.style === 'cancel');

  if (nonCancel.length === 1) {
    if (window.confirm(msg)) {
      nonCancel[0].onPress?.();
    } else {
      cancel?.onPress?.();
    }
    return;
  }

  // Multiple non-cancel buttons: prompt for each in turn
  for (const btn of nonCancel) {
    if (window.confirm(`${msg}\n\n→ OK to: ${btn.text}`)) {
      btn.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}
