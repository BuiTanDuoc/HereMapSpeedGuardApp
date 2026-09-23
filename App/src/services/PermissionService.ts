import { Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  request,
  check,
} from 'react-native-permissions';

/**
 * Xin quyền truy cập vị trí (foreground).
 * Trả về true nếu được cấp quyền, false nếu bị từ chối.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  const permission = Platform.select({
    android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  });

  if (!permission) {
    return false;
  }

  const currentStatus = await check(permission);
  if (currentStatus === RESULTS.GRANTED) {
    return true;
  }

  const result = await request(permission);
  return result === RESULTS.GRANTED;
}
