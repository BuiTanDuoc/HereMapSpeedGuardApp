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

/**
 * Kiểm tra (không xin lại) quyền vị trí hiện có đang thực sự ĐƯỢC CẤP hay không.
 *
 * Dùng để gác trước khi khởi động foreground service kiểu "location": Android bắt buộc
 * app phải đang giữ quyền ACCESS_FINE_LOCATION/ACCESS_COARSE_LOCATION tại đúng thời điểm
 * gọi startForeground(), nếu không sẽ ném SecurityException và GIẾT TIẾN TRÌNH NGAY LẬP
 * TỨC (crash native, không qua JS nên không hiện log). Vì `ENABLE_MOCK_LOCATION_FALLBACK`
 * có thể khiến app vẫn chạy được bằng GPS giả lập dù quyền thật đã bị từ chối, phải kiểm
 * tra lại đúng lúc chuẩn bị bật chạy nền — không dựa vào kết quả xin quyền lúc mở app.
 */
export async function hasLocationPermission(): Promise<boolean> {
  const permission = Platform.select({
    android: PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
  });
  if (!permission) return false;
  try {
    return (await check(permission)) === RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Android 13+ cần xin quyền hiện thông báo để notification của chế độ chạy nền hiển
 * thị. Bị từ chối thì service vẫn chạy nhưng không thấy notification.
 */
export async function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) {
    return;
  }
  try {
    const status = await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
    if (status !== RESULTS.GRANTED) {
      await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
    }
  } catch (e) {
    console.warn('[PermissionService] Không xin được quyền thông báo:', e);
  }
}
