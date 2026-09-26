import axios from 'axios';
import { HERE_API_KEY } from '../config/AppConfig';
import { SpeedLimitResult } from '../types';

/**
 * HERE Map Attributes API v8 — endpoint chính thức để tra cứu thuộc tính bản đồ
 * (bao gồm SPEED_LIMITS_FCn) theo vị trí, thay cho Routing API v7 GetLinkInfo đã
 * lỗi thời. Docs: https://docs.here.com/map-attributes/docs
 *
 *   GET https://smap.hereapi.com/v8/maps/attributes
 *       ?layers=SPEED_LIMITS_FCN(*)
 *       &in=proximity:<lat>,<lon>;r=<bán kính mét>
 *       &apiKey=YOUR_HERE_API_KEY
 *
 * "in=proximity:lat,lon;r=..." tìm các link đường trong bán kính quanh toạ độ hiện
 * tại (spatial filter). Layer "SPEED_LIMITS_FCN" (N = tất cả functional class) trả
 * về các cột FROM_REF_SPEED_LIMIT / TO_REF_SPEED_LIMIT (tốc độ theo 2 chiều của
 * link) — dùng "(*)" để lấy toàn bộ cột thay vì chỉ định từng cột.
 *
 * ⚠️ HERE khuyến nghị: nếu cần tốc độ áp dụng cuối cùng cho 1 loại xe cụ thể (đã
 * gộp cả giới hạn có điều kiện, giới hạn theo giờ, giới hạn xe tải...), nên dùng
 * layer APPLICABLE_SPEED_LIMIT thay vì SPEED_LIMITS_FCN thô — xem
 * https://docs.here.com/map-attributes/docs/applicablespeedlimit
 */
const MAP_ATTRIBUTES_ENDPOINT = 'https://smap.hereapi.com/v8/maps/attributes';

/** Bán kính (mét) tìm link đường quanh vị trí GPS hiện tại. */
const SEARCH_RADIUS_METERS = 50;

/**
 * Gọi HERE Map Attributes API v8 để lấy tốc độ tối đa cho phép gần 1 toạ độ.
 */
export async function fetchSpeedLimit(
  latitude: number,
  longitude: number,
): Promise<SpeedLimitResult> {
  try {
    const response = await axios.get(MAP_ATTRIBUTES_ENDPOINT, {
      params: {
        layers: 'SPEED_LIMITS_FCN(*)',
        in: `proximity:${latitude},${longitude};r=${SEARCH_RADIUS_METERS}`,
        apiKey: HERE_API_KEY,
      },
      timeout: 8000,
    });

    const speedLimitKmh = extractSpeedLimitKmh(response.data);
    return { speedLimitKmh, raw: response.data };
  } catch (error) {
    console.warn('[SpeedLimitService] Lỗi khi gọi HERE Map Attributes API:', error);
    return { speedLimitKmh: null };
  }
}

/**
 * Response của Map Attributes API v8 có dạng:
 *   { "Tiles": [ { "Meta": {...}, "Rows": [ { "LINK_ID": ..., "FROM_REF_SPEED_LIMIT": ...,
 *                  "TO_REF_SPEED_LIMIT": ... }, ... ] } ] }
 * Đơn vị mặc định của HERE map content là km/h.
 * ⚠️ Nên log response.data thật (field "raw" ở trên) một lần với tài khoản của bạn để
 * xác nhận đúng tên cột, vì có thể khác nhau tuỳ vùng bản đồ/map release.
 */
function extractSpeedLimitKmh(data: any): number | null {
  try {
    const tiles = data?.Tiles ?? [];
    for (const tile of tiles) {
      const rows = tile?.Rows ?? [];
      for (const row of rows) {
        const rawValue = row?.TO_REF_SPEED_LIMIT ?? row?.FROM_REF_SPEED_LIMIT;
        const speedLimitKmh =
          typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (Number.isFinite(speedLimitKmh) && speedLimitKmh > 0) {
          return speedLimitKmh;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
