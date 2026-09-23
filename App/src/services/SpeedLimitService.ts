import axios from 'axios';
import { HERE_API_KEY } from '../config/AppConfig';
import { SpeedLimitResult } from '../types';

/**
 * ⚠️ LƯU Ý QUAN TRỌNG VỀ ENDPOINT:
 * "https://hereapi.com?apiKey=...&attributes=SPEED_LIMITS_FCN(*)" trong yêu cầu gốc
 * chỉ là mô tả khái quát, không phải host thật của HERE (hereapi.com không phải domain
 * public của HERE). Tham số "attributes=SPEED_LIMITS_FCN(*)" thực chất thuộc về
 * HERE Routing API v7 - "Get Link Info" (trả về thuộc tính link đường, gồm tốc độ
 * cho phép), có dạng:
 *
 *   GET https://route.ls.hereapi.com/routing/7.2/getlinkinfo.json
 *       ?apiKey=YOUR_HERE_API_KEY
 *       &waypoint=<lat>,<lon>
 *       &attributes=SPEED_LIMITS_FCN(*)
 *
 * Endpoint này dùng API Key kiểu cũ (apiKey, không phải app_id/app_code) và cần được
 * bật trong gói dịch vụ HERE của bạn (Routing API v7 / Fleet Telematics). Vì mỗi tài
 * khoản HERE có thể được cấp domain/plan khác nhau, hãy XÁC NHẬN LẠI endpoint chính
 * xác trong HERE Developer Portal của bạn rồi cập nhật hằng số SPEED_LIMIT_ENDPOINT
 * bên dưới cho khớp. Toàn bộ phần còn lại của app (debounce, cảnh báo, bản đồ...)
 * không phụ thuộc vào việc đổi endpoint này.
 */
const SPEED_LIMIT_ENDPOINT = 'https://route.ls.hereapi.com/routing/7.2/getlinkinfo.json';

/**
 * Gọi HERE API để lấy tốc độ tối đa cho phép tại 1 toạ độ.
 * Dùng POST theo đúng yêu cầu; nếu tài khoản HERE của bạn chỉ hỗ trợ GET cho
 * endpoint này, đổi axios.post -> axios.get với { params } tương ứng.
 */
export async function fetchSpeedLimit(
  latitude: number,
  longitude: number,
): Promise<SpeedLimitResult> {
  try {
    const response = await axios.post(
      SPEED_LIMIT_ENDPOINT,
      {},
      {
        params: {
          apiKey: HERE_API_KEY,
          waypoint: `${latitude},${longitude}`,
          attributes: 'SPEED_LIMITS_FCN(*)',
        },
        timeout: 8000,
      },
    );

    const speedLimitKmh = extractSpeedLimitKmh(response.data);
    return { speedLimitKmh, raw: response.data };
  } catch (error) {
    console.warn('[SpeedLimitService] Lỗi khi gọi HERE API:', error);
    return { speedLimitKmh: null };
  }
}

/**
 * HERE trả speed limit theo m/s trong trường SPEED_LIMITS_FCN của response.
 * Cấu trúc JSON thật có thể khác tuỳ version API — hãy log response.data thật
 * một lần (raw ở trên) rồi chỉnh lại hàm này cho khớp field chính xác.
 */
function extractSpeedLimitKmh(data: any): number | null {
  try {
    const links = data?.Response?.RouteLinks ?? data?.RouteLinks ?? [];
    const firstLink = Array.isArray(links) ? links[0] : links;
    const attributes = firstLink?.Attributes ?? firstLink?.attributes;
    const speedLimitMs =
      attributes?.SPEED_LIMITS_FCN?.[0]?.SPEED_LIMIT ??
      attributes?.SPEED_LIMITS_FCN?.SPEED_LIMIT;

    if (typeof speedLimitMs === 'number') {
      return Math.round(speedLimitMs * 3.6);
    }
    return null;
  } catch {
    return null;
  }
}
