import { Platform } from 'react-native';
import BackgroundService, { BackgroundTaskOptions } from 'react-native-background-actions';

/**
 * Chạy nền bằng Foreground Service (Android): hiện 1 notification thường trực và giữ
 * tiến trình app sống khi tắt màn hình / chuyển sang app khác, nhờ đó GPS + cảnh báo
 * giọng nói vẫn hoạt động. Logic theo dõi vẫn nằm trong useNavigation; service này
 * chỉ giữ cho tiến trình JS không bị hệ điều hành tạm dừng.
 */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const keepAliveTask = async (args?: { delay?: number }) => {
  const delay = args?.delay ?? 5000;
  while (BackgroundService.isRunning()) {
    await sleep(delay);
  }
};

const options: BackgroundTaskOptions & { parameters: { delay: number } } = {
  taskName: 'HereSpeedGuard',
  taskTitle: 'HereSpeedGuard đang theo dõi tốc độ',
  taskDesc: 'Đang lấy vị trí GPS...',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#4f8ef7',
  parameters: { delay: 5000 },
  // ⚠️ BẮT BUỘC phải khớp với android:foregroundServiceType="location" khai trong
  // AndroidManifest.xml (thẻ <service> của RNBackgroundActionsTask). Thiếu dòng này,
  // trên Android 14+ (API 34+, project đang compile/target SDK 36) hệ điều hành coi
  // đây là kiểu foreground service không hợp lệ và GIẾT TIẾN TRÌNH NGAY LẬP TỨC (crash
  // native, không đi qua JS nên Metro/dev tools không hiện log). Máy chạy Android bản
  // cũ hơn 14 không bắt buộc khai báo này nên không thấy crash — đây là lý do có thể
  // "chạy trên máy thật thì được, máy ảo (thường cài Android mới hơn) thì crash".
  foregroundServiceType: ['location'],
};

/** Phải gọi khi app đang ở foreground (Android 12+ không cho khởi động service từ nền). */
export async function startBackgroundTracking(): Promise<void> {
  if (Platform.OS !== 'android' || BackgroundService.isRunning()) return;
  try {
    await BackgroundService.start(keepAliveTask, options);
  } catch (e) {
    console.warn('[BackgroundService] Không khởi động được chạy nền:', e);
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) return;
  try {
    await BackgroundService.stop();
  } catch (e) {
    console.warn('[BackgroundService] Không dừng được chạy nền:', e);
  }
}

let lastNotificationAt = 0;
let lastNotificationText = '';

/** Cập nhật nội dung notification (tối đa 1 lần / 3 giây để không spam). */
export function updateBackgroundNotification(text: string): void {
  if (Platform.OS !== 'android' || !BackgroundService.isRunning()) return;
  const now = Date.now();
  if (text === lastNotificationText || now - lastNotificationAt < 3000) return;
  lastNotificationAt = now;
  lastNotificationText = text;
  BackgroundService.updateNotification({ taskDesc: text }).catch(() => {});
}
