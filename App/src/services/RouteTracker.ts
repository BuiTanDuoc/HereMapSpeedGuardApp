import {
  ARRIVAL_DISTANCE_M,
  MIN_OFF_ROUTE_DISTANCE_M,
  OFF_ROUTE_ACCURACY_FACTOR,
  ROUTE_MATCH_LOOKAHEAD_POINTS,
} from '../config/AppConfig';
import { LatLng, RoutePlan } from '../types';
import { bearingDegrees, projectOnSegment } from '../utils/geo';

export interface RouteMatch {
  /** Đoạn hiện tại nằm giữa points[segmentIndex] và points[segmentIndex + 1]. */
  segmentIndex: number;
  /** Khoảng cách từ vị trí GPS tới tuyến (mét). */
  distanceFromRouteM: number;
  /** true nếu đã lệch khỏi tuyến (vượt ngưỡng, có tính độ chính xác GPS). */
  offRoute: boolean;
  /** Mét đã đi được dọc tuyến. */
  traveledMeters: number;
  remainingMeters: number;
  /** Tốc độ giới hạn (km/h) của đoạn đường hiện tại. null nếu không có dữ liệu hoặc đang lệch tuyến. */
  speedLimitKmh: number | null;
  nextInstruction: { text: string; distanceM: number } | null;
  arrived: boolean;
}

/**
 * So khớp vị trí GPS với tuyến đã tính SẴN — hoàn toàn cục bộ, không gọi mạng.
 * Tốc độ giới hạn được dựng sẵn thành mảng theo từng đoạn thẳng của polyline lúc tạo tracker,
 * nên mỗi lần cập nhật GPS chỉ tốn O(số điểm trong cửa sổ tìm kiếm).
 */
export class RouteTracker {
  private readonly route: RoutePlan;
  /** limitBySegment[i] = tốc độ giới hạn (km/h) của đoạn points[i] → points[i+1]. */
  private readonly limitBySegment: Array<number | null>;
  private cursor = 0;

  constructor(route: RoutePlan, forcedSpeedLimitKmh: number | null = null) {
    this.route = route;
    const segmentCount = route.points.length - 1;
    this.limitBySegment = new Array<number | null>(segmentCount).fill(forcedSpeedLimitKmh);

    if (forcedSpeedLimitKmh === null) {
      for (const seg of route.segments) {
        const end = Math.min(seg.endIndex, segmentCount);
        for (let i = Math.max(0, seg.startIndex); i < end; i++) {
          this.limitBySegment[i] = seg.speedLimitKmh;
        }
      }
    }
  }

  update(position: LatLng, accuracyM: number = 0): RouteMatch {
    const { points, cumulativeMeters, totalMeters } = this.route;
    const lastSegment = points.length - 2;

    // 1) Tìm trong cửa sổ quanh vị trí cũ (chỉ cho lùi rất ít) — tránh nhảy nhầm khi
    //    tuyến đi qua cùng 1 con đường 2 lần.
    const from = Math.max(0, this.cursor - 2);
    const to = Math.min(lastSegment, this.cursor + ROUTE_MATCH_LOOKAHEAD_POINTS);
    let best = this.scan(position, from, to);

    const threshold = Math.max(MIN_OFF_ROUTE_DISTANCE_M, accuracyM * OFF_ROUTE_ACCURACY_FACTOR);

    // 2) Ngoài cửa sổ mà quá xa → quét toàn tuyến (GPS nhảy, hoặc xuất phát ở giữa tuyến).
    if (best.distance > threshold && (from > 0 || to < lastSegment)) {
      const global = this.scan(position, 0, lastSegment);
      if (global.distance < best.distance) best = global;
    }

    const offRoute = best.distance > threshold;
    if (!offRoute) this.cursor = best.index;

    const segLen = cumulativeMeters[best.index + 1] - cumulativeMeters[best.index];
    const traveledMeters = cumulativeMeters[best.index] + best.t * segLen;
    const remainingMeters = Math.max(0, totalMeters - traveledMeters);

    return {
      segmentIndex: best.index,
      distanceFromRouteM: best.distance,
      offRoute,
      traveledMeters,
      remainingMeters,
      speedLimitKmh: offRoute ? null : this.limitBySegment[best.index],
      nextInstruction: this.nextInstruction(best.index, traveledMeters),
      arrived: !offRoute && remainingMeters <= ARRIVAL_DISTANCE_M,
    };
  }

  private scan(position: LatLng, from: number, to: number) {
    const { points } = this.route;
    let bestIndex = from;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestT = 0;

    for (let i = from; i <= to; i++) {
      const proj = projectOnSegment(position, points[i], points[i + 1]);
      // "<" (không phải "<=") để khi 2 đoạn bằng nhau thì ưu tiên đoạn đứng trước.
      if (proj.distance < bestDistance) {
        bestDistance = proj.distance;
        bestIndex = i;
        bestT = proj.t;
      }
    }
    return { index: bestIndex, distance: bestDistance, t: bestT };
  }

  private nextInstruction(segmentIndex: number, traveledMeters: number) {
    const { instructions, cumulativeMeters } = this.route;
    // Chỉ dẫn đầu tiên nằm ở điểm phía trước đoạn hiện tại.
    const next = instructions.find(ins => ins.pointIndex > segmentIndex);
    if (!next) return null;
    return {
      text: next.text,
      distanceM: Math.max(0, cumulativeMeters[next.pointIndex] - traveledMeters),
    };
  }
}

/** Vị trí (và hướng) tại `meters` mét tính từ đầu tuyến — dùng cho giả lập xe chạy dọc tuyến. */
export function pointAlongRoute(
  route: RoutePlan,
  meters: number,
): { position: LatLng; heading: number } {
  const { points, cumulativeMeters, totalMeters } = route;
  const m = Math.max(0, Math.min(meters, cumulativeMeters[cumulativeMeters.length - 1] ?? totalMeters));

  // tìm nhị phân đoạn chứa m
  let lo = 0;
  let hi = points.length - 2;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (cumulativeMeters[mid] <= m) lo = mid;
    else hi = mid - 1;
  }

  const a = points[lo];
  const b = points[lo + 1];
  const segLen = cumulativeMeters[lo + 1] - cumulativeMeters[lo];
  const t = segLen === 0 ? 0 : (m - cumulativeMeters[lo]) / segLen;

  return {
    position: {
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    },
    heading: bearingDegrees(a, b),
  };
}
