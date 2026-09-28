import { decodeFlexPolyline } from '../src/utils/flexPolyline';
import { parseRouteResponse } from '../src/services/RoutingService';
import { RouteTracker, pointAlongRoute } from '../src/services/RouteTracker';

// Polyline mẫu mã hoá bằng thư viện flexpolyline chính thức (precision 6)
const SECTION_1 =
  'BGo04xUomwwrGw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BA';
const SECTION_2 = 'BG4oxzUomwwrGAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-BAw-B';

const response = {
  routes: [
    {
      sections: [
        {
          polyline: SECTION_1,
          summary: { length: 3222, duration: 400 },
          // 13.8888893 m/s = 50 km/h, 8.333334 m/s = 30 km/h, span cuối không có dữ liệu
          spans: [{ offset: 0, speedLimit: 13.8888893 }, { offset: 10, speedLimit: 8.333334 }, { offset: 20 }],
          actions: [
            { offset: 0, instruction: 'Đi về hướng Bắc.' },
            { offset: 10, instruction: 'Rẽ trái vào đường A.' },
          ],
        },
        {
          polyline: SECTION_2,
          summary: { length: 1100, duration: 150 },
          spans: [{ offset: 0, speedLimit: 16.6666667 }],
          actions: [{ offset: 10, instruction: 'Bạn đã đến nơi.' }],
        },
      ],
    },
  ],
};

describe('decodeFlexPolyline', () => {
  it('khớp ví dụ trong tài liệu HERE', () => {
    const pts = decodeFlexPolyline('BGozinkDq77vZApLwCnfA7aQjL');
    expect(pts).toEqual([
      { latitude: 52.54482, longitude: 13.367221 },
      { latitude: 52.54482, longitude: 13.36704 },
      { latitude: 52.54486, longitude: 13.36654 },
      { latitude: 52.54486, longitude: 13.36611 },
      { latitude: 52.544868, longitude: 13.365932 },
    ]);
  });
});

describe('parseRouteResponse', () => {
  const route = parseRouteResponse(response);

  it('nối các section thành 1 polyline liên tục và đổi m/s → km/h', () => {
    expect(route.points).toHaveLength(40);
    expect(route.segments).toEqual([
      { startIndex: 0, endIndex: 10, speedLimitKmh: 50 },
      { startIndex: 10, endIndex: 20, speedLimitKmh: 30 },
      { startIndex: 20, endIndex: 29, speedLimitKmh: null },
      { startIndex: 29, endIndex: 39, speedLimitKmh: 60 },
    ]);
    expect(route.instructions.map(i => i.pointIndex)).toEqual([0, 10, 39]);
    expect([route.totalSeconds, route.totalMeters]).toEqual([550, 4322]);
  });

  it('báo lỗi khi HERE không trả tuyến nào', () => {
    expect(() => parseRouteResponse({ routes: [] })).toThrow();
  });
});

describe('RouteTracker', () => {
  const route = parseRouteResponse(response);
  const near = (i: number, dLon = 0) => ({
    latitude: route.points[i].latitude + 0.0002,
    longitude: route.points[i].longitude + dLon,
  });

  it('tra tốc độ giới hạn theo đoạn đang đi, cục bộ', () => {
    const t = new RouteTracker(route);
    expect(t.update(near(3)).speedLimitKmh).toBe(50);
    expect(t.update(near(15)).speedLimitKmh).toBe(30);
    expect(t.update(near(25)).speedLimitKmh).toBeNull(); // không có dữ liệu → không cảnh báo
    expect(t.update(near(34)).speedLimitKmh).toBe(60);
  });

  it('báo chỉ dẫn kế tiếp và quãng đường còn lại', () => {
    const m = new RouteTracker(route).update(near(3));
    expect(m.nextInstruction?.text).toBe('Rẽ trái vào đường A.');
    expect(m.nextInstruction!.distanceM).toBeGreaterThan(600);
    expect(m.nextInstruction!.distanceM).toBeLessThan(900);
    expect(m.remainingMeters).toBeGreaterThan(0);
  });

  it('phát hiện lệch tuyến (có tính độ chính xác GPS) và không trả tốc độ khi lệch', () => {
    const t = new RouteTracker(route);
    const off = t.update(near(5, 0.004));
    expect(off.offRoute).toBe(true);
    expect(off.speedLimitKmh).toBeNull();
    // ~100m lệch: GPS tốt → lệch, GPS kém (sai số 100m) → vẫn coi là trên tuyến
    expect(new RouteTracker(route).update(near(5, 0.0009), 5).offRoute).toBe(true);
    expect(new RouteTracker(route).update(near(5, 0.0009), 100).offRoute).toBe(false);
  });

  it('nhận biết đã đến nơi', () => {
    const end = route.points[39];
    const m = new RouteTracker(route).update({ latitude: end.latitude, longitude: end.longitude + 0.00005 });
    expect(m.arrived).toBe(true);
  });

  it('DEBUG_FORCE_SPEED_LIMIT ép cứng tốc độ cho toàn tuyến', () => {
    expect(new RouteTracker(route, 40).update(near(25)).speedLimitKmh).toBe(40);
  });

  it('pointAlongRoute kẹp trong tuyến', () => {
    const start = pointAlongRoute(route, 0);
    expect(start.position.latitude).toBeCloseTo(route.points[0].latitude, 6);
    const end = pointAlongRoute(route, 1e9);
    expect(end.position.longitude).toBeCloseTo(route.points[39].longitude, 6);
  });
});
