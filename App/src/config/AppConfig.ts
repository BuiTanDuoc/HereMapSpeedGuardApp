/**
 * Cấu hình chung của app.
 * ⚠️ Thay YOUR_HERE_API_KEY bằng API Key HERE thật (lấy tại https://platform.here.com).
 * Nên tách sang biến môi trường (.env / react-native-config) khi build production,
 * tránh commit key thật lên git.
 */
export const HERE_API_KEY = 'ezNJO0jlK6ACNZBBmmWo8l22fFmq8iqtNNp2LHTTlpQ'; //'sOk5-lcrpA3D7AywrljbIlqQwqCBdWibaDP-K5OfEew';

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
export const SPEED_CHECK_MIN_INTERVAL_MS = 10000;

/**
 * Nếu HERE trả về lỗi 429 (vượt rate limit) và không có header Retry-After,
 * tạm dừng gọi API trong khoảng thời gian này (ms) trước khi thử lại.
 * Mỗi lần bị 429 liên tiếp, thời gian nghỉ sẽ tự nhân đôi (tối đa
 * RATE_LIMIT_MAX_COOLDOWN_MS) để tránh dồn dập gọi lại rồi lại bị chặn tiếp.
 */
export const RATE_LIMIT_DEFAULT_COOLDOWN_MS = 30000;

/** Thời gian nghỉ tối đa (ms) dù bị 429 liên tiếp bao nhiêu lần. */
export const RATE_LIMIT_MAX_COOLDOWN_MS = 5 * 60 * 1000; // 5 phút

/**
 * 🧪 CHẾ ĐỘ TEST: đặt 1 số (ví dụ 50) để ÉP CỨNG tốc độ giới hạn, bỏ qua hoàn
 * toàn việc gọi HERE API — dùng khi muốn test logic cảnh báo vượt tốc độ +
 * giọng nói mà không phụ thuộc vào HERE API (ví dụ đang bị 429/hết quota).
 * Đặt lại về `null` để dùng dữ liệu thật từ HERE.
 */
export const DEBUG_FORCE_SPEED_LIMIT_KMH: number | null = null;
// export const DEBUG_FORCE_SPEED_LIMIT_KMH: number | null = 60;
/**
 * Cấu hình theo dõi vị trí GPS.
 */
export const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: 0,
  interval: 1000,
  fastestInterval: 500,
};

/**
 * Cấu hình giả lập GPS — dùng để test trên emulator/thiết bị không phát tín hiệu
 * tốc độ, hướng di chuyển thật. Khi bật, nếu không nhận được bất kỳ vị trí GPS thật
 * nào trong MOCK_LOCATION_TIMEOUT_MS, hoặc GPS báo lỗi, app tự chuyển sang dữ liệu
 * giả lập (tốc độ dao động 0-80km/h) để vẫn test được luồng cảnh báo vượt tốc độ.
 *
 * ⚠️ Nhớ đặt ENABLE_MOCK_LOCATION_FALLBACK = false trước khi build bản thật cho
 * người dùng, tránh app "giả vờ" có GPS khi máy thật không lấy được vị trí.
 */
export const ENABLE_MOCK_LOCATION_FALLBACK = true;

/** Thời gian (ms) chờ GPS thật trước khi chuyển sang giả lập. */
export const MOCK_LOCATION_TIMEOUT_MS = 6000;

/** Toạ độ gốc để giả lập vị trí di chuyển xung quanh (mặc định: trung tâm TP.HCM). */
export const MOCK_LOCATION_ORIGIN = {
  latitude: 10.7769,
  longitude: 106.7009,
};

/** Khoảng thời gian (ms) giữa mỗi lần phát ra 1 điểm GPS giả lập. */
export const MOCK_LOCATION_INTERVAL_MS = 5000;
