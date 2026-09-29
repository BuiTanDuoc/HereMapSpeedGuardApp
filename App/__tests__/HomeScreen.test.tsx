import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { GpsData, RoutePlan } from '../src/types';
import { haversineMeters } from '../src/utils/geo';

let emitFix: (d: GpsData) => void = () => {};
jest.mock('react-native-webview', () => ({ __esModule: true, default: () => null }));
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
  speakGuidance: jest.fn().mockReturnValue(true),
  getVoiceLanguage: () => 'vi-VN',
  stopVoiceAlert: jest.fn(),
  getVoiceStatus: () => ({ state: 'ready', language: 'vi-VN' }),
  subscribeVoiceStatus: () => () => {},
  retryVoiceInitIfUnavailable: jest.fn(),
}));
jest.mock('../src/services/RoutingService', () => ({
  ...jest.requireActual('../src/services/RoutingService'),
  fetchRoute: jest.fn(),
  searchPlaces: jest.fn().mockResolvedValue([]),
}));

import HomeScreen from '../src/screens/HomeScreen';
import { fetchRoute } from '../src/services/RoutingService';

function makeRoute(): RoutePlan {
  const points = Array.from({ length: 30 }, (_, i) => ({ latitude: 10.7769 + i * 0.001, longitude: 106.7009 }));
  const cumulativeMeters = [0];
  for (let i = 1; i < points.length; i++) cumulativeMeters.push(cumulativeMeters[i - 1] + haversineMeters(points[i - 1], points[i]));
  return {
    points,
    cumulativeMeters,
    totalMeters: cumulativeMeters[29],
    totalSeconds: 600,
    segments: [{ startIndex: 0, endIndex: 29, speedLimitKmh: 50 }],
    instructions: [{ pointIndex: 10, text: 'Rẽ trái vào đường A.' }],
  };
}

const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [t.props.children].flat(Infinity).join(''));
const press = (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const node = r.root.findAll(n => n.props.onPress && n.findAllByType(Text).some(t => [t.props.children].flat(Infinity).join('').includes(label)))[0];
  return act(async () => { await node.props.onPress(); });
};

it('Màn hình: Khởi hành → hiện chỉ dẫn + nút Kết thúc; Kết thúc → về trạng thái ban đầu', async () => {
  (fetchRoute as jest.Mock).mockResolvedValue(makeRoute());
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<HomeScreen />); });
  await act(async () => { emitFix({ latitude: 10.7771, longitude: 106.7009, speedKmh: 0, heading: 0, accuracy: 5, timestamp: 1 }); });

  // Ban đầu: chưa có nút Khởi hành/Kết thúc
  expect(texts(r).some(t => t.includes('Khởi hành'))).toBe(false);
  expect(texts(r).some(t => t.includes('Kết thúc'))).toBe(false);

  // Chọn điểm trên bản đồ (HereMapView đã mock null nên gọi thẳng qua hook bằng cách chọn từ kết quả tìm)
  const map = r.root.findAll(n => typeof n.props.onSelectPoint === 'function')[0];
  await act(async () => { map.props.onSelectPoint({ latitude: 10.8059, longitude: 106.7009 }); });
  expect(texts(r).some(t => t.includes('Khởi hành'))).toBe(true);
  expect(texts(r).some(t => t.includes('30 km') || t.includes('3.2 km') || t.includes('km'))).toBe(true);

  await press(r, 'Khởi hành');
  expect(texts(r).some(t => t.includes('Kết thúc'))).toBe(true);
  expect(texts(r).some(t => t.includes('Khởi hành'))).toBe(false);

  await act(async () => { emitFix({ latitude: 10.7799, longitude: 106.7009, speedKmh: 80, heading: 0, accuracy: 5, timestamp: 2 }); });
  expect(texts(r).some(t => t.includes('QUÁ TỐC ĐỘ'))).toBe(true);
  expect(texts(r).some(t => t.includes('Rẽ trái vào đường A.'))).toBe(true);

  await press(r, 'Kết thúc');
  expect(texts(r).some(t => t.includes('Kết thúc'))).toBe(false);
  expect(texts(r).some(t => t.includes('QUÁ TỐC ĐỘ'))).toBe(false);

  await act(async () => { r.unmount(); });
});
