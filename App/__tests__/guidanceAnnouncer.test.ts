import { GuidanceAnnouncer, guidanceSpeech, guidanceThresholds, speakableDistance } from '../src/services/GuidanceAnnouncer';
import { RouteMatch } from '../src/services/RouteTracker';
import { RoutePlan } from '../src/types';

function makeRoute(): RoutePlan {
  return {
    points: Array.from({ length: 50 }, (_, i) => ({ latitude: 10 + i * 0.0001, longitude: 106 })),
    cumulativeMeters: Array.from({ length: 50 }, (_, i) => i * 20), // ~20m/điểm
    totalMeters: 980,
    totalSeconds: 120,
    segments: [],
    instructions: [
      { pointIndex: 0, text: 'Đi về hướng Bắc.' },
      { pointIndex: 30, text: 'Rẽ trái vào đường A.' },
      { pointIndex: 49, text: 'Bạn đã đến nơi.' },
    ],
  };
}

const match = (over: Partial<RouteMatch>): RouteMatch => ({
  segmentIndex: 0,
  distanceFromRouteM: 0,
  offRoute: false,
  traveledMeters: 0,
  remainingMeters: 0,
  speedLimitKmh: null,
  nextInstruction: null,
  arrived: false,
  ...over,
});

describe('guidanceThresholds', () => {
  it('kẹp trong khoảng min-max, tăng theo tốc độ', () => {
    expect(guidanceThresholds(0)).toEqual({ farM: 400, nearM: 80 });
    expect(guidanceThresholds(1000).farM).toBe(1000); // kẹp max
    expect(guidanceThresholds(36).nearM).toBeGreaterThan(80); // 36km/h=10m/s *10s=100m
  });
});

describe('speakableDistance', () => {
  it('làm tròn 50m dưới 1km, 0.1km từ 1km, dùng dấu phẩy tiếng Việt', () => {
    expect(speakableDistance(430, 'vi-VN')).toBe('450 mét');
    expect(speakableDistance(40, 'vi-VN')).toBe('50 mét');
    expect(speakableDistance(1240, 'vi-VN')).toBe('1,2 ki lô mét');
    expect(speakableDistance(1240, 'en-US')).toBe('1.2 kilometers');
  });
});

describe('GuidanceAnnouncer', () => {
  it('đọc câu xuất phát 1 lần khi announceStart=true và mới đi vài mét đầu', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: true });
    const m = match({ traveledMeters: 20, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 580 } });
    const c = a.next(m, 30);
    expect(c?.kind).toBe('start');
    a.markSpoken(c!.key);
    expect(a.next(m, 30)).toBeNull(); // đã đọc rồi, chưa tới ngưỡng "far"
  });

  it('không đọc câu xuất phát khi announceStart=false (dùng sau khi tính lại đường)', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: false });
    const m = match({ traveledMeters: 20, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 580 } });
    expect(a.next(m, 30)?.kind).not.toBe('start');
  });

  it('nhắc xa rồi nhắc gần, mỗi loại chỉ 1 lần cho cùng 1 chỗ rẽ', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: false });
    // tốc độ 36km/h=10m/s → farM=300 (kẹp min 400) thực ra min=400 nên farM=400, nearM=100
    const farMatch = match({ traveledMeters: 600, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 380 } });
    const far = a.next(farMatch, 36);
    expect(far?.kind).toBe('far');
    a.markSpoken(far!.key);
    expect(a.next(farMatch, 36)).toBeNull(); // đã đọc "far", chưa tới "near"

    const nearMatch = match({ traveledMeters: 590, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 90 } });
    const near = a.next(nearMatch, 36);
    expect(near?.kind).toBe('near');
    a.markSpoken(near!.key);
    expect(a.next(nearMatch, 36)).toBeNull(); // đã đọc "near" cho chỗ rẽ này
  });

  it('bỏ qua "far" nếu đã ở trong ngưỡng "near" (tránh đọc 2 câu liền nhau)', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: false });
    const m = match({ traveledMeters: 600, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 90 } });
    // 90m nằm trong nearM (kẹp min 80) nên phải nhận "near" ngay, không phải "far"
    expect(a.next(m, 40)?.kind).toBe('near');
  });

  it('đến nơi: đọc 1 lần "arrived", không đọc lại', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: false });
    const m = match({ arrived: true, remainingMeters: 10 });
    const c = a.next(m, 10);
    expect(c?.kind).toBe('arrived');
    a.markSpoken(c!.key);
    expect(a.next(m, 10)).toBeNull();
  });

  it('không đọc khi đang lệch tuyến', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: true });
    const m = match({ offRoute: true, traveledMeters: 20, nextInstruction: { pointIndex: 30, text: 'x', distanceM: 580 } });
    expect(a.next(m, 30)).toBeNull();
  });

  it('không đọc lại "far" cho chỗ rẽ đã qua nếu bên gọi chưa markSpoken (không mất lượt khi TTS bận)', () => {
    const route = makeRoute();
    const a = new GuidanceAnnouncer(route, { announceStart: false });
    const m = match({ traveledMeters: 600, nextInstruction: { pointIndex: 30, text: 'Rẽ trái vào đường A.', distanceM: 380 } });
    const c1 = a.next(m, 36);
    expect(c1?.kind).toBe('far');
    // Không gọi markSpoken (giả lập TTS đang bận) → lần sau vẫn trả về ứng viên y hệt để thử lại
    const c2 = a.next(m, 36);
    expect(c2).toEqual(c1);
  });
});

describe('guidanceSpeech', () => {
  it('câu "far" có tiền tố khoảng cách, câu "near" chỉ đọc chỉ dẫn gốc', () => {
    expect(guidanceSpeech({ key: 'k', kind: 'far', instructionText: 'Rẽ trái.', distanceM: 480 }, 'vi-VN')).toBe(
      'Sau 500 mét, Rẽ trái.',
    );
    expect(guidanceSpeech({ key: 'k', kind: 'near', instructionText: 'Rẽ trái.', distanceM: 90 }, 'vi-VN')).toBe('Rẽ trái.');
    expect(guidanceSpeech({ key: 'k', kind: 'arrived', instructionText: '', distanceM: 0 }, 'vi-VN')).toBe('Bạn đã đến nơi.');
  });
});
