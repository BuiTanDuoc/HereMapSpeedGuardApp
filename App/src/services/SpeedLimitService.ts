import axios from 'axios';
import { HERE_API_KEY } from '../config/AppConfig';
import { SpeedLimitResult } from '../types';

/**
 * HERE Map Attributes API v8 — tra cứu tốc độ giới hạn theo vị trí:
 *
 *   GET https://smap.hereapi.com/v8/maps/attributes
 *       ?layers=SPEED_LIMITS_FC1,SPEED_LIMITS_FC2,...,SPEED_LIMITS_FC5
 *       &in=proximity:<lat>,<lon>;r=<bán kính mét>
 *       &apiKey=YOUR_HERE_API_KEY
 *
 * Lưu ý: "SPEED_LIMITS_FCn" là tên mẫu — n là functional class của đường (1-5),
 * nên phải liệt kê từng layer thật (FC1..FC5). Đường nội thành thường thuộc
 * FC3-FC5, đường cao tốc/quốc lộ là FC1-FC2. Mỗi layer có thể được tính 1
 * transaction, nên nếu muốn tiết kiệm quota có thể bớt layer không cần dùng.
 *
 * Response mẫu:
 *   { "geometries": [ { "layerId": "SPEED_LIMITS_FC1",
 *       "attributes": { "LINK_ID": "...", "FROM_REF_SPEED_LIMIT": "80",
 *                       "TO_REF_SPEED_LIMIT": "80", "SPEED_LIMIT_UNIT": "K" },
 *       "geometry": "MULTILINESTRING((lon lat,lon lat,...))" } ], "meta": [...] }
 */
const MAP_ATTRIBUTES_ENDPOINT = 'https://smap.hereapi.com/v8/maps/attributes';
const SPEED_LIMIT_LAYERS = [
  'SPEED_LIMITS_FC1',
  'SPEED_LIMITS_FC2',
  'SPEED_LIMITS_FC3',
  'SPEED_LIMITS_FC4',
  'SPEED_LIMITS_FC5',
].join(',');

/** Bán kính (mét) tìm link đường quanh vị trí GPS hiện tại. */
const SEARCH_RADIUS_METERS = 50;

const MPH_TO_KMH = 1.609344;

export async function fetchSpeedLimit(
  latitude: number,
  longitude: number,
): Promise<SpeedLimitResult> {
  const requestId = Date.now();
  console.log(
    `[SpeedLimitService] #${requestId} Gọi API tại (${latitude.toFixed(5)}, ${longitude.toFixed(5)})...`,
  );

  try {
    const response = await axios.get(MAP_ATTRIBUTES_ENDPOINT, {
      params: {
        layers: SPEED_LIMIT_LAYERS,
        in: `proximity:${latitude},${longitude};r=${SEARCH_RADIUS_METERS}`,
        apiKey: HERE_API_KEY,
      },
      timeout: 8000,
    });

    const speedLimitKmh = extractSpeedLimitKmh(response.data, latitude, longitude);
    console.log(
      `[SpeedLimitService] #${requestId} Kết quả: speedLimitKmh=${speedLimitKmh} (số đoạn đường trả về: ${response.data?.geometries?.length ?? 0})`,
    );
    return { speedLimitKmh, raw: response.data };
  } catch (error: any) {
    const status = error?.response?.status;

    if (status === 429) {
      const retryAfterHeader = error?.response?.headers?.['retry-after'];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      console.warn(
        `[SpeedLimitService] #${requestId} HERE API trả 429 — sẽ tạm dừng gọi API.` +
          (retryAfterMs ? ` Retry-After: ${retryAfterMs}ms` : ''),
        error?.response?.data,
      );
      return {
        speedLimitKmh: null,
        rateLimited: true,
        retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs! : null,
      };
    }

    console.warn(
      `[SpeedLimitService] #${requestId} Lỗi khi gọi HERE Map Attributes API (status=${status}):`,
      error?.response?.data ?? error?.message,
    );
    return { speedLimitKmh: null };
  }
}

/**
 * Trong các đoạn đường trả về, chọn đoạn GẦN vị trí GPS nhất (tránh nhầm sang
 * đường giao cắt/đường song song) rồi lấy tốc độ giới hạn của nó, quy về km/h.
 */
function extractSpeedLimitKmh(data: any, lat: number, lon: number): number | null {
  const geometries: any[] = Array.isArray(data?.geometries) ? data.geometries : [];
  let best: { distance: number; kmh: number; linkId: string } | null = null;

  for (const item of geometries) {
    const attrs = item?.attributes;
    if (!attrs) continue;

    const kmh = readSpeedKmh(attrs);
    if (kmh === null) continue;

    const distance = distanceToGeometryMeters(item.geometry, lat, lon);
    if (best === null || distance < best.distance) {
      best = { distance, kmh, linkId: String(attrs.LINK_ID ?? '?') };
    }
  }

  if (best) {
    console.log(
      `[SpeedLimitService] Chọn đoạn đường LINK_ID=${best.linkId}, cách vị trí ~${Math.round(best.distance)}m, giới hạn ${best.kmh}km/h`,
    );
  }
  return best ? best.kmh : null;
}

function readSpeedKmh(attrs: any): number | null {
  const values = [attrs.FROM_REF_SPEED_LIMIT, attrs.TO_REF_SPEED_LIMIT]
    .map(v => Number(v))
    // 999 = không giới hạn (HERE), 0/NaN = không có dữ liệu
    .filter(v => Number.isFinite(v) && v > 0 && v < 999);
  if (values.length === 0) return null;

  // Nếu 2 chiều khác nhau, lấy giá trị cao hơn để tránh cảnh báo nhầm.
  const raw = Math.max(...values);
  const isMph = String(attrs.SPEED_LIMIT_UNIT).toUpperCase() === 'M';
  return Math.round(isMph ? raw * MPH_TO_KMH : raw);
}

/** Khoảng cách (mét) từ điểm GPS tới đường WKT MULTILINESTRING((lon lat,...)). */
function distanceToGeometryMeters(wkt: unknown, lat: number, lon: number): number {
  if (typeof wkt !== 'string') return Number.POSITIVE_INFINITY;

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const toXY = (pLon: number, pLat: number) => ({
    x: (pLon - lon) * 111320 * cosLat,
    y: (pLat - lat) * 110540,
  });

  let minDistance = Number.POSITIVE_INFINITY;
  for (const part of wkt.split(/\)\s*,\s*\(/)) {
    const pairs = [...part.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(m =>
      toXY(Number(m[1]), Number(m[2])),
    );
    for (let i = 0; i < pairs.length - 1; i++) {
      minDistance = Math.min(minDistance, pointToSegment(pairs[i], pairs[i + 1]));
    }
    if (pairs.length === 1) {
      minDistance = Math.min(minDistance, Math.hypot(pairs[0].x, pairs[0].y));
    }
  }
  return minDistance;
}

/** Khoảng cách từ gốc toạ độ (0,0) tới đoạn thẳng a-b. */
function pointToSegment(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}
