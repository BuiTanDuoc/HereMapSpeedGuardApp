import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { GpsData, RoutePlan } from '../src/types';
import { haversineMeters } from '../src/utils/geo';

// ---- mocks (đặt trước khi import hook) ----
let emitFix: (d: GpsData) => void = () => {};
jest.mock('../src/config/AppConfig', () => ({
  ...jest.requireActual('../src/config/AppConfig'),
  ENABLE_MOCK_LOCATION_FALLBACK: false,
}));
jest.mock('../src/services/LocationService', () => ({
  startWatchingLocation: (onUpdate: (d: GpsData) => void) => {
    emitFix = onUpdate;
    return 1;
  },
  stopWatchingLocation: jest.fn(),
}));
jest.mock('../src/services/PermissionService', () => ({
  ensureLocationPermission: jest.fn().mockResolvedValue(true),
  ensureNotificationPermission: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/BackgroundService', () => ({
  startBackgroundTracking: jest.fn().mockResolvedValue(undefined),
  stopBackgroundTracking: jest.fn().mockResolvedValue(undefined),
  updateBackgroundNotification: jest.fn(),
}));
jest.mock('../src/services/VoiceAlertService', () => ({
  initVoiceAlert: jest.fn().mockResolvedValue(undefined),
  speakOverspeedWarning: jest.fn(),
  stopVoiceAlert: jest.fn(),
  getVoiceStatus: () => ({ state: 'ready', language: 'vi-VN' }),
  subscribeVoiceStatus: () => () => {},
  retryVoiceInitIfUnavailable: jest.fn(),
}));
jest.mock('../src/services/RoutingService', () => ({
  ...jest.requireActual('../src/services/RoutingService'),
  fetchRoute: jest.fn(),
}));

import { useNavigation, NavigationState } from '../src/hooks/useNavigation';
import { fetchRoute } from '../src/services/RoutingService';
import { speakOverspeedWarning } from '../src/services/VoiceAlertService';
import { startBackgroundTracking, stopBackgroundTracking } from '../src/services/BackgroundService';

// Tuyến thẳng lên Bắc: 0-10 → 50km/h, 10-20 → 30km/h, 20-29 → không có dữ liệu
function makeRoute(): RoutePlan {
  const points = Array.from({ length: 30 }, (_, i) => ({ latitude: 10.7769 + i * 0.001, longitude: 106.7009 }));
  const cumulativeMeters = [0];
  for (let i = 1; i < points.length; i++) cumulativeMeters.push(cumulativeMeters[i - 1] + haversineMeters(points[i - 1], points[i]));
  return {
    points,
    cumulativeMeters,
    totalMeters: cumulativeMeters[29],
    totalSeconds: 400,
    segments: [
      { startIndex: 0, endIndex: 10, speedLimitKmh: 50 },
      { startIndex: 10, endIndex: 20, speedLimitKmh: 30 },
      { startIndex: 20, endIndex: 29, speedLimitKmh: null },
    ],
    instructions: [{ pointIndex: 10, text: 'Rẽ trái' }],
  };
}

// dLon: độ lệch ngang so với tuyến (tuyến chạy thẳng về phía Bắc nên lệch theo kinh độ mới là lệch tuyến)
const fix = (i: number, speedKmh: number, dLon = 0): GpsData => ({
  latitude: 10.7769 + i * 0.001 + 0.0001,
  longitude: 106.7009 + dLon,
  speedKmh,
  heading: 0,
  accuracy: 5,
  timestamp: Date.now(),
});

let api: NavigationState;
function Harness() {
  api = useNavigation();
  return null;
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('useNavigation — cảnh báo chỉ hoạt động giữa "Khởi hành" và "Kết thúc"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchRoute as jest.Mock).mockResolvedValue(makeRoute());
  });

  it('idle/planning: không cảnh báo; navigating: cảnh báo, không gọi API theo từng điểm; sau Kết thúc: tắt', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
    await flush();

    // 1) idle — chạy 120km/h cũng KHÔNG cảnh báo
    await act(async () => { emitFix(fix(2, 120)); });
    expect(api.phase).toBe('idle');
    expect(speakOverspeedWarning).not.toHaveBeenCalled();
    expect(api.isOverLimit).toBe(false);

    // 2) chọn điểm đến → planning (đã có tuyến), vẫn KHÔNG cảnh báo
    await act(async () => { await api.setDestination({ latitude: 10.8059, longitude: 106.7009, label: 'Đích' }); });
    expect(api.phase).toBe('planning');
    expect(api.route).not.toBeNull();
    await act(async () => { emitFix(fix(2, 120)); });
    expect(speakOverspeedWarning).not.toHaveBeenCalled();
    expect(startBackgroundTracking).not.toHaveBeenCalled();

    // 3) Khởi hành → bật cảnh báo
    await act(async () => { await api.startTrip(); });
    expect(api.phase).toBe('navigating');
    expect(startBackgroundTracking).toHaveBeenCalledTimes(1);

    await act(async () => { emitFix(fix(3, 80)); });            // đoạn 50km/h, đang 80
    expect(api.speedLimitKmh).toBe(50);
    expect(api.isOverLimit).toBe(true);
    expect(speakOverspeedWarning).toHaveBeenLastCalledWith(80, 50);

    await act(async () => { emitFix(fix(4, 45)); });            // trong giới hạn
    expect(api.isOverLimit).toBe(false);

    await act(async () => { emitFix(fix(15, 40)); });           // đoạn 30km/h, đang 40 → vượt
    expect(api.speedLimitKmh).toBe(30);
    expect(speakOverspeedWarning).toHaveBeenLastCalledWith(40, 30);

    await act(async () => { emitFix(fix(25, 100)); });          // đoạn không có dữ liệu → không cảnh báo
    expect(api.speedLimitKmh).toBeNull();
    const callsBefore = (speakOverspeedWarning as jest.Mock).mock.calls.length;
    expect(callsBefore).toBe(2);

    // Chỉ 1 lần gọi API duy nhất (lúc tính đường) — KHÔNG gọi theo từng điểm GPS
    expect(fetchRoute).toHaveBeenCalledTimes(1);

    // 4) Kết thúc → tắt cảnh báo + dừng chạy nền + xoá tuyến
    await act(async () => { await api.endTrip(); });
    expect(api.phase).toBe('idle');
    expect(api.route).toBeNull();
    expect(api.destination).toBeNull();
    expect(stopBackgroundTracking).toHaveBeenCalled();
    await act(async () => { emitFix(fix(3, 150)); });
    expect(speakOverspeedWarning).toHaveBeenCalledTimes(callsBefore); // không thêm cảnh báo nào
    expect(api.isOverLimit).toBe(false);

    await act(async () => { renderer!.unmount(); });
  });

  it('lệch tuyến liên tiếp → tự tính lại đường (gọi API lần 2), tuyến mới có tốc độ mới', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { renderer = ReactTestRenderer.create(<Harness />); });
    await flush();
    await act(async () => { emitFix(fix(2, 30)); });
    await act(async () => { await api.setDestination({ latitude: 10.8059, longitude: 106.7009, label: 'Đích' }); });
    await act(async () => { await api.startTrip(); });

    const rerouted = makeRoute();
    rerouted.segments = [{ startIndex: 0, endIndex: 29, speedLimitKmh: 25 }];
    (fetchRoute as jest.Mock).mockResolvedValue(rerouted);

    // 1-2 điểm lệch (GPS nhảy) → chưa tính lại
    await act(async () => { emitFix(fix(5, 30, 0.004)); });
    await act(async () => { emitFix(fix(5, 30, 0.004)); });
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    // quay lại đúng tuyến → bộ đếm lệch reset
    await act(async () => { emitFix(fix(5, 30)); });
    expect(api.match?.offRoute).toBe(false);

    // lệch liên tiếp 4 điểm → tính lại
    for (let k = 0; k < 4; k++) await act(async () => { emitFix(fix(5, 30, 0.004)); });
    await flush();
    expect(fetchRoute).toHaveBeenCalledTimes(2);

    await act(async () => { emitFix(fix(6, 30)); });
    expect(api.speedLimitKmh).toBe(25);

    await act(async () => { await api.endTrip(); renderer!.unmount(); });
  });
});
