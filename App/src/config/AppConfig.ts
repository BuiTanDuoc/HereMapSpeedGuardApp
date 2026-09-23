/**
 * Cấu hình chung của app.
 * ⚠️ Thay YOUR_HERE_API_KEY bằng API Key HERE thật (lấy tại https://platform.here.com).
 * Nên tách sang biến môi trường (.env / react-native-config) khi build production,
 * tránh commit key thật lên git.
 */
export const HERE_API_KEY = 'YOUR_HERE_API_KEY';

/**
 * Ngưỡng tốc độ (km/h) để bắt đầu coi là "chạy nhanh" và cần tra cứu tốc độ cho phép.
 */
export const SPEED_CHECK_THRESHOLD_KMH = 50;

/**
 * Biên độ thay đổi tốc độ (km/h) tối thiểu giữa 2 lần gọi API,
 * để tránh gọi API liên tục khi tốc độ dao động nhẹ.
 */
export const SPEED_CHECK_DELTA_KMH = 5;

/**
 * Khoảng thời gian tối thiểu (ms) giữa 2 lần gọi API kiểm tra tốc độ,
 * để tránh vượt rate-limit của HERE khi tốc độ thay đổi nhanh liên tục.
 */
export const SPEED_CHECK_MIN_INTERVAL_MS = 5000;

/**
 * Cấu hình theo dõi vị trí GPS.
 */
export const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: 0,
  interval: 1000,
  fastestInterval: 500,
};
