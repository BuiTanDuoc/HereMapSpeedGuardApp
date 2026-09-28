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

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Kết quả tìm kiếm địa điểm (HERE Discover API). */
export interface PlaceResult {
  id: string;
  title: string;
  address: string;
  position: LatLng;
}

/**
 * Một đoạn đường (span) trên tuyến, có tốc độ giới hạn kèm theo.
 * `startIndex..endIndex` là chỉ số điểm trong `RoutePlan.points` (endIndex là điểm cuối, gồm cả).
 */
export interface SpeedSegment {
  startIndex: number;
  endIndex: number;
  /** km/h. null nếu HERE không có dữ liệu tốc độ cho đoạn này */
  speedLimitKmh: number | null;
}

/** Một chỉ dẫn rẽ / đổi hướng. `pointIndex` là chỉ số điểm trong `RoutePlan.points`. */
export interface RouteInstruction {
  pointIndex: number;
  text: string;
}

export interface RoutePlan {
  points: LatLng[];
  /** khoảng cách tích luỹ (mét) từ điểm đầu tới từng điểm — cùng độ dài với `points` */
  cumulativeMeters: number[];
  totalMeters: number;
  totalSeconds: number;
  segments: SpeedSegment[];
  instructions: RouteInstruction[];
}

export type TripPhase = 'idle' | 'planning' | 'navigating';
