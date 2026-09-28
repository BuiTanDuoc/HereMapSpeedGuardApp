import { LatLng } from '../types';

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Khoảng cách đường chim bay (haversine), đơn vị mét. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SegmentProjection {
  /** khoảng cách (mét) từ điểm tới đoạn a-b */
  distance: number;
  /** vị trí hình chiếu trên đoạn a-b, 0 = tại a, 1 = tại b */
  t: number;
}

/**
 * Chiếu điểm `p` lên đoạn thẳng a-b (xấp xỉ phẳng quanh p — đủ chính xác cho đoạn
 * ngắn vài trăm mét trở xuống, là độ dài điển hình giữa các điểm của polyline).
 */
export function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): SegmentProjection {
  const cosLat = Math.cos(toRad(p.latitude));
  const mPerDegLat = 110540;
  const mPerDegLon = 111320 * cosLat;

  const ax = (a.longitude - p.longitude) * mPerDegLon;
  const ay = (a.latitude - p.latitude) * mPerDegLat;
  const bx = (b.longitude - p.longitude) * mPerDegLon;
  const by = (b.latitude - p.latitude) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return { distance: Math.hypot(ax + t * dx, ay + t * dy), t };
}

/** Góc hướng (0-360°, 0 = Bắc) từ a tới b. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.latitude);
  const phi2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
