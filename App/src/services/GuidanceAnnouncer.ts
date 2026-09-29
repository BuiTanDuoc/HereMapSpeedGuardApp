import {
  GUIDANCE_FAR_MAX_M,
  GUIDANCE_FAR_MIN_M,
  GUIDANCE_FAR_SECONDS,
  GUIDANCE_NEAR_MAX_M,
  GUIDANCE_NEAR_MIN_M,
  GUIDANCE_NEAR_SECONDS,
} from '../config/AppConfig';
import { RoutePlan } from '../types';
import { RouteMatch } from './RouteTracker';

export type GuidanceKind = 'start' | 'far' | 'near' | 'arrived';

export interface GuidanceCandidate {
  /** Định danh duy nhất của lần nhắc — mỗi key chỉ đọc 1 lần. */
  key: string;
  kind: GuidanceKind;
  /** Nội dung chỉ dẫn do HERE trả về (rỗng với kind = 'arrived'). */
  instructionText: string;
  /** Khoảng cách còn lại tới chỗ rẽ (mét). */
  distanceM: number;
}

/** Ngưỡng nhắc xa / nhắc gần (mét) theo tốc độ hiện tại: đi càng nhanh càng nhắc sớm. */
export function guidanceThresholds(speedKmh: number): { farM: number; nearM: number } {
  const ms = Math.max(0, speedKmh) / 3.6;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    farM: clamp(ms * GUIDANCE_FAR_SECONDS, GUIDANCE_FAR_MIN_M, GUIDANCE_FAR_MAX_M),
    nearM: clamp(ms * GUIDANCE_NEAR_SECONDS, GUIDANCE_NEAR_MIN_M, GUIDANCE_NEAR_MAX_M),
  };
}

/**
 * Quyết định KHI NÀO đọc chỉ dẫn rẽ. Thuần logic (không đụng TTS) nên test được.
 *
 * Mỗi chỉ dẫn được đọc tối đa 2 lần: "far" (Sau 500 mét, rẽ trái...) và "near" (Rẽ trái...).
 * Bên gọi chỉ gọi `markSpoken(key)` khi đã đọc THẬT SỰ — nếu bộ đọc đang bận thì lần cập nhật
 * GPS kế tiếp sẽ thử lại, không bị mất lượt nhắc.
 */
export class GuidanceAnnouncer {
  private readonly route: RoutePlan;
  private readonly announceStart: boolean;
  private readonly spoken = new Set<string>();

  /** announceStart: đọc câu "xuất phát" (vd. "Đi về hướng Bắc") — bỏ qua khi tính lại đường giữa chừng. */
  constructor(route: RoutePlan, options: { announceStart: boolean }) {
    this.route = route;
    this.announceStart = options.announceStart;
  }

  markSpoken(key: string): void {
    this.spoken.add(key);
  }

  next(match: RouteMatch, speedKmh: number): GuidanceCandidate | null {
    if (match.offRoute) return null;

    if (match.arrived) {
      return this.spoken.has('arrived')
        ? null
        : { key: 'arrived', kind: 'arrived', instructionText: '', distanceM: match.remainingMeters };
    }

    // Câu xuất phát: chỉ đọc khi mới đi những mét đầu tiên.
    const first = this.route.instructions[0];
    if (
      this.announceStart &&
      first &&
      first.pointIndex === 0 &&
      match.traveledMeters < 150 &&
      !this.spoken.has('start')
    ) {
      return { key: 'start', kind: 'start', instructionText: first.text, distanceM: 0 };
    }

    const ins = match.nextInstruction;
    if (!ins) return null;

    const { farM, nearM } = guidanceThresholds(speedKmh);
    const isLast = ins.pointIndex >= this.route.points.length - 1;
    const nearKey = `${ins.pointIndex}:near`;
    const farKey = `${ins.pointIndex}:far`;

    // Chỗ rẽ cuối cùng là điểm đến — đã có câu "đã đến nơi" riêng nên chỉ nhắc xa 1 lần.
    if (!isLast && ins.distanceM <= nearM && !this.spoken.has(nearKey)) {
      return { key: nearKey, kind: 'near', instructionText: ins.text, distanceM: ins.distanceM };
    }

    // Nếu đã quá gần thì bỏ qua lần nhắc xa (sẽ nhắc "near" ngay) để không đọc 2 câu liền nhau.
    const farAllowed = isLast ? ins.distanceM <= farM : ins.distanceM <= farM && ins.distanceM > nearM * 2;
    if (farAllowed && !this.spoken.has(farKey) && !this.spoken.has(nearKey)) {
      return { key: farKey, kind: 'far', instructionText: ins.text, distanceM: ins.distanceM };
    }

    return null;
  }
}

/** Đọc khoảng cách thành lời: làm tròn 50m (dưới 1km) hoặc 0,1km (từ 1km). */
export function speakableDistance(meters: number, lang: 'vi-VN' | 'en-US'): string {
  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return lang === 'en-US' ? `${rounded} meters` : `${rounded} mét`;
  }
  const km = Math.round(meters / 100) / 10;
  const text = lang === 'en-US' ? String(km) : String(km).replace('.', ',');
  return lang === 'en-US' ? `${text} kilometers` : `${text} ki lô mét`;
}

export function guidanceSpeech(cand: GuidanceCandidate, lang: 'vi-VN' | 'en-US'): string {
  switch (cand.kind) {
    case 'arrived':
      return lang === 'en-US' ? 'You have arrived at your destination.' : 'Bạn đã đến nơi.';
    case 'far':
      return lang === 'en-US'
        ? `In ${speakableDistance(cand.distanceM, lang)}, ${cand.instructionText}`
        : `Sau ${speakableDistance(cand.distanceM, lang)}, ${cand.instructionText}`;
    case 'start':
    case 'near':
    default:
      return cand.instructionText;
  }
}

export function rerouteSpeech(lang: 'vi-VN' | 'en-US'): string {
  return lang === 'en-US'
    ? 'You have left the route. Recalculating.'
    : 'Bạn đã đi lệch tuyến, đang tính lại đường.';
}
