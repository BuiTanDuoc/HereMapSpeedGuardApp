import {
  MOCK_LOCATION_ORIGIN,
  MOCK_LOCATION_INTERVAL_MS,
} from '../config/AppConfig';
import { GpsData } from '../types';

/**
 * Giả lập GPS để test trên emulator/thiết bị không có sẵn vị trí + tốc độ di
 * chuyển thật (emulator Android/iOS thường đứng yên tại 1 toạ độ cố định, không
 * có "speed"). Tốc độ giả lập dao động hình sin trong khoảng 0-80km/h theo chu
 * kỳ ~60 giây, để test được cả 2 trường hợp: dưới ngưỡng (an toàn) và vượt
 * ngưỡng 50km/h (kích hoạt cảnh báo + gọi API tra tốc độ cho phép).
 *
 * Toạ độ cũng di chuyển nhẹ quanh MOCK_LOCATION_ORIGIN để giả lập xe đang chạy
 * trên bản đồ (không đứng yên 1 điểm), và heading quay dần 360 độ.
 */
export function startMockLocation(
  onUpdate: (data: GpsData) => void,
  intervalMs: number = MOCK_LOCATION_INTERVAL_MS,
): ReturnType<typeof setInterval> {
  let tick = 0;

  return setInterval(() => {
    tick += 1;

    // Dao động 0-80km/h, chu kỳ ~63s (2*PI*10 tick * 1s)
    const speedKmh = Math.max(0, 40 + 40 * Math.sin(tick / 10));
    // Quay dần 0-360 độ
    const heading = (tick * 6) % 360;

    onUpdate({
      latitude: MOCK_LOCATION_ORIGIN.latitude + Math.sin(tick / 50) * 0.003,
      longitude: MOCK_LOCATION_ORIGIN.longitude + Math.cos(tick / 50) * 0.003,
      speedKmh,
      heading,
      accuracy: 5,
      timestamp: Date.now(),
      isMock: true,
    });
  }, intervalMs);
}

export function stopMockLocation(
  timerId: ReturnType<typeof setInterval>,
): void {
  clearInterval(timerId);
}
