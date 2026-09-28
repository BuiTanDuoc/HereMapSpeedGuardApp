import axios from 'axios';
import {
  HERE_API_KEY,
  HERE_DISCOVER_ENDPOINT,
  HERE_ROUTING_ENDPOINT,
  ROUTING_LANG,
  ROUTING_TRANSPORT_MODE,
  SEARCH_COUNTRY_CODE,
  SEARCH_LIMIT,
} from '../config/AppConfig';
import { LatLng, PlaceResult, RouteInstruction, RoutePlan, SpeedSegment } from '../types';
import { decodeFlexPolyline } from '../utils/flexPolyline';
import { haversineMeters } from '../utils/geo';

export class RoutingError extends Error {
  /** true nếu lỗi do mạng / HERE tạm thời không phản hồi — người dùng có thể thử lại. */
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'RoutingError';
    this.retryable = retryable;
  }
}

const MS_TO_KMH = 3.6;

/**
 * Tính đường bằng HERE Routing API v8 và lấy LUÔN tốc độ giới hạn của từng đoạn đường
 * dọc tuyến trong cùng 1 lần gọi (`spans=maxSpeed`). Nhờ vậy trong lúc di chuyển không
 * cần gọi API tra tốc độ theo từng điểm GPS nữa.
 *
 *   GET https://router.hereapi.com/v8/routes
 *       ?origin=<lat>,<lon>&destination=<lat>,<lon>
 *       &transportMode=car&routingMode=fast
 *       &return=polyline,summary,actions,instructions
 *       &spans=maxSpeed
 *       &lang=vi-VN,en-US&apiKey=...
 */
export async function fetchRoute(origin: LatLng, destination: LatLng): Promise<RoutePlan> {
  let data: any;
  try {
    const response = await axios.get(HERE_ROUTING_ENDPOINT, {
      params: {
        origin: `${origin.latitude},${origin.longitude}`,
        destination: `${destination.latitude},${destination.longitude}`,
        transportMode: ROUTING_TRANSPORT_MODE,
        routingMode: 'fast',
        return: 'polyline,summary,actions,instructions',
        spans: 'maxSpeed',
        lang: ROUTING_LANG,
        apiKey: HERE_API_KEY,
      },
      timeout: 15000,
    });
    data = response.data;
  } catch (error: any) {
    throw toRoutingError(error);
  }
  return parseRouteResponse(data);
}

function toRoutingError(error: any): RoutingError {
  const status = error?.response?.status;
  const detail = error?.response?.data?.title ?? error?.response?.data?.error_description;
  console.warn('[RoutingService] Lỗi gọi Routing API:', status, error?.response?.data ?? error?.message);

  if (status === 401 || status === 403) {
    return new RoutingError('HERE API key không hợp lệ hoặc chưa bật dịch vụ Routing.');
  }
  if (status === 429) {
    return new RoutingError('HERE báo vượt giới hạn số lần gọi (429). Vui lòng thử lại sau ít phút.', true);
  }
  if (status === 400) {
    return new RoutingError(
      `Không tính được đường đi${detail ? ` (${detail})` : ''}. Hãy thử chọn điểm đến khác gần đường hơn.`,
    );
  }
  if (!error?.response) {
    return new RoutingError('Không kết nối được tới HERE. Kiểm tra mạng rồi thử lại.', true);
  }
  return new RoutingError(`HERE trả lỗi ${status}. Vui lòng thử lại.`, true);
}

/**
 * Chuyển response của Routing API v8 thành RoutePlan. Tách riêng hàm thuần để dễ test.
 * Nếu tuyến có nhiều section (ví dụ có phà), các section được nối lại thành 1 polyline liên tục.
 */
export function parseRouteResponse(data: any): RoutePlan {
  const route = data?.routes?.[0];
  const sections: any[] = Array.isArray(route?.sections) ? route.sections : [];
  if (sections.length === 0) {
    throw new RoutingError('Không tìm được đường đi giữa 2 điểm này.');
  }

  const points: LatLng[] = [];
  const segments: SpeedSegment[] = [];
  const instructions: RouteInstruction[] = [];
  let totalSeconds = 0;
  let summaryMeters = 0;

  for (const section of sections) {
    if (typeof section?.polyline !== 'string') continue;
    const sectionPoints = decodeFlexPolyline(section.polyline);
    if (sectionPoints.length === 0) continue;

    // Điểm đầu của section sau trùng điểm cuối section trước → dùng chung 1 điểm.
    const shift = points.length > 0 ? points.length - 1 : 0;
    points.push(...(points.length > 0 ? sectionPoints.slice(1) : sectionPoints));
    const lastLocalIndex = sectionPoints.length - 1;

    const spans: any[] = Array.isArray(section.spans) ? section.spans : [];
    for (let i = 0; i < spans.length; i++) {
      const startLocal = Number(spans[i].offset ?? 0);
      const endLocal = i + 1 < spans.length ? Number(spans[i + 1].offset) : lastLocalIndex;
      if (endLocal <= startLocal) continue;
      segments.push({
        startIndex: shift + startLocal,
        endIndex: shift + endLocal,
        speedLimitKmh: readSpanSpeedKmh(spans[i]),
      });
    }

    const actions: any[] = Array.isArray(section.actions) ? section.actions : [];
    for (const action of actions) {
      if (typeof action?.instruction !== 'string' || action.instruction.length === 0) continue;
      instructions.push({ pointIndex: shift + Number(action.offset ?? 0), text: action.instruction });
    }

    totalSeconds += Number(section.summary?.duration ?? section.travelSummary?.duration ?? 0);
    summaryMeters += Number(section.summary?.length ?? section.travelSummary?.length ?? 0);
  }

  if (points.length < 2) {
    throw new RoutingError('Tuyến đường trả về không hợp lệ.');
  }

  const cumulativeMeters: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeMeters.push(cumulativeMeters[i - 1] + haversineMeters(points[i - 1], points[i]));
  }

  return {
    points,
    cumulativeMeters,
    totalMeters: summaryMeters > 0 ? summaryMeters : cumulativeMeters[cumulativeMeters.length - 1],
    totalSeconds,
    segments,
    instructions,
  };
}

/** Đọc tốc độ giới hạn (m/s → km/h) của 1 span. null nếu không có dữ liệu / không giới hạn. */
function readSpanSpeedKmh(span: any): number | null {
  if (span?.maxSpeed?.unlimited === true) return null;
  const ms = Number(span?.speedLimit ?? span?.maxSpeed?.speed ?? span?.maxSpeed);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const kmh = Math.round(ms * MS_TO_KMH);
  // ≥ 200 km/h thường là giá trị "không giới hạn" (autobahn...) — không dùng để cảnh báo.
  return kmh >= 200 ? null : kmh;
}

/** Tìm địa điểm theo tên/địa chỉ (HERE Discover API), ưu tiên kết quả gần `near`. */
export async function searchPlaces(query: string, near: LatLng): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const response = await axios.get(HERE_DISCOVER_ENDPOINT, {
      params: {
        q,
        at: `${near.latitude},${near.longitude}`,
        limit: SEARCH_LIMIT,
        lang: 'vi',
        ...(SEARCH_COUNTRY_CODE ? { in: `countryCode:${SEARCH_COUNTRY_CODE}` } : {}),
        apiKey: HERE_API_KEY,
      },
      timeout: 8000,
    });

    const items: any[] = Array.isArray(response.data?.items) ? response.data.items : [];
    return items
      .filter(item => Number.isFinite(item?.position?.lat) && Number.isFinite(item?.position?.lng))
      .map(item => ({
        id: String(item.id ?? `${item.position.lat},${item.position.lng}`),
        title: String(item.title ?? item.address?.label ?? ''),
        address: String(item.address?.label ?? ''),
        position: { latitude: item.position.lat, longitude: item.position.lng },
      }));
  } catch (error: any) {
    console.warn('[RoutingService] Lỗi tìm địa điểm:', error?.response?.status, error?.response?.data ?? error?.message);
    throw new RoutingError(
      error?.response?.status === 429
        ? 'HERE báo vượt giới hạn số lần gọi (429). Thử lại sau ít phút.'
        : 'Không tìm được địa điểm. Kiểm tra mạng rồi thử lại.',
      true,
    );
  }
}
