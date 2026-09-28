/**
 * Cấu hình chung của app.
 * ⚠️ Thay YOUR_HERE_API_KEY bằng API Key HERE thật (lấy tại https://platform.here.com).
 * Key cần bật các dịch vụ: Routing v8, Geocoding & Search (Discover), Raster Tile API v3.
 * Nên tách sang biến môi trường (.env / react-native-config) khi build production,
 * tránh commit key thật lên git.
 */
export const HERE_API_KEY = 'YOUR_HERE_API_KEY';

/* ------------------------------------------------------------------ */
/* Chỉ đường (HERE Routing API v8) + tìm địa điểm (HERE Discover)      */
/* ------------------------------------------------------------------ */

export const HERE_ROUTING_ENDPOINT = 'https://router.hereapi.com/v8/routes';
export const HERE_DISCOVER_ENDPOINT = 'https://discover.search.hereapi.com/v1/discover';

/** Phương tiện dùng để tính đường: car | truck | scooter | bicycle ... (tốc độ giới hạn phụ thuộc mode này). */
export const ROUTING_TRANSPORT_MODE = 'car';

/** Ngôn ngữ chỉ dẫn rẽ, thử lần lượt từ trái sang phải; nếu HERE không có tiếng Việt sẽ rơi về tiếng Anh. */
export const ROUTING_LANG = 'vi-VN,en-US';

/** Giới hạn kết quả tìm địa điểm theo quốc gia (mã ISO 3166-1 alpha-3). null = không giới hạn. */
export const SEARCH_COUNTRY_CODE: string | null = 'VNM';

/** Số kết quả tìm địa điểm tối đa. */
export const SEARCH_LIMIT = 6;

/** Khoảng cách tối thiểu (mét) tới tuyến để coi là "lệch tuyến" (xem thêm OFF_ROUTE_ACCURACY_FACTOR). */
export const MIN_OFF_ROUTE_DISTANCE_M = 60;

/**
 * Coi là "lệch tuyến" khi khoảng cách tới tuyến > max(MIN_OFF_ROUTE_DISTANCE_M, độ chính xác GPS × hệ số này).
 */
export const OFF_ROUTE_ACCURACY_FACTOR = 1.5;

/** Số lần cập nhật GPS liên tiếp bị lệch tuyến trước khi tự tính lại đường (chống GPS nhảy 1-2 điểm). */
export const OFF_ROUTE_CONSECUTIVE_FIXES = 4;

/** Khoảng cách tối thiểu (ms) giữa 2 lần tính lại đường, tránh gọi Routing API liên tục. */
export const REROUTE_MIN_INTERVAL_MS = 15000;

/** Khi tìm vị trí trên tuyến, chỉ xét trong khoảng N điểm phía trước vị trí cũ (tránh nhảy nhầm khi tuyến đi qua cùng 1 đường 2 lần). */
export const ROUTE_MATCH_LOOKAHEAD_POINTS = 80;

/** Còn cách đích ≤ mức này (mét) thì coi là đã đến nơi. */
export const ARRIVAL_DISTANCE_M = 30;

/* ------------------------------------------------------------------ */
/* Cảnh báo quá tốc độ                                                 */
/* ------------------------------------------------------------------ */

/** Dung sai (km/h): chỉ cảnh báo khi tốc độ > tốc độ cho phép + dung sai. 0 = cảnh báo ngay khi vượt. */
export const OVERSPEED_TOLERANCE_KMH = 0;

/**
 * 🧪 CHẾ ĐỘ TEST: đặt 1 số (ví dụ 50) để ÉP CỨNG tốc độ giới hạn cho toàn tuyến, bỏ qua
 * dữ liệu tốc độ từ HERE — dùng khi muốn test logic cảnh báo + giọng nói mà không phụ
 * thuộc dữ liệu đường. Đặt lại về `null` để dùng dữ liệu thật từ HERE.
 */
export const DEBUG_FORCE_SPEED_LIMIT_KMH: number | null = null;
// export const DEBUG_FORCE_SPEED_LIMIT_KMH: number | null = 60;

/* ------------------------------------------------------------------ */
/* GPS                                                                 */
/* ------------------------------------------------------------------ */

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
 * giả lập để vẫn test được luồng chỉ đường + cảnh báo vượt tốc độ:
 *  - Khi chưa khởi hành: xe giả lập chạy quanh MOCK_LOCATION_ORIGIN.
 *  - Sau khi bấm "Khởi hành": xe giả lập chạy dọc theo tuyến đã tính, tốc độ dao động 0-80km/h.
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

/** Khoảng thời gian (ms) giữa mỗi lần phát ra 1 điểm GPS giả lập khi chưa khởi hành. */
export const MOCK_LOCATION_INTERVAL_MS = 5000;

/** Khoảng thời gian (ms) giữa mỗi điểm GPS giả lập khi chạy dọc tuyến (sau "Khởi hành"). */
export const MOCK_ROUTE_SIM_INTERVAL_MS = 1000;
