export interface GpsData {
  latitude: number;
  longitude: number;
  /** km/h, đã convert từ m/s */
  speedKmh: number;
  /** độ (0-360), null nếu thiết bị không xác định được hướng */
  heading: number | null;
  accuracy: number;
  timestamp: number;
  /** true nếu đây là dữ liệu GPS giả lập (dùng khi test trên emulator, không phải vị trí thật) */
  isMock?: boolean;
}

export interface SpeedLimitResult {
  /** km/h. null nếu API không trả về được (mất mạng, không có dữ liệu tuyến đường,...) */
  speedLimitKmh: number | null;
  raw?: unknown;
}
