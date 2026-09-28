/* eslint-disable no-bitwise */
/**
 * Giải mã HERE Flexible Polyline (định dạng `polyline` trong Routing API v8).
 * Đặc tả: https://github.com/heremaps/flexible-polyline
 *
 * Chỉ giải mã 2D (lat, lng); nếu có chiều thứ 3 (độ cao...) thì bỏ qua giá trị đó.
 */
const DECODING_TABLE = [
  62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, 5,
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, 63,
  -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
  49, 50, 51,
];

function decodeChar(char: string): number {
  const value = DECODING_TABLE[char.charCodeAt(0) - 45];
  if (value === undefined || value < 0) {
    throw new Error(`Flexible polyline: ký tự không hợp lệ "${char}"`);
  }
  return value;
}

/** Đọc 1 số nguyên biến độ dài (varint 5-bit) bắt đầu tại `index`. */
function decodeUnsignedVarint(encoded: string, index: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = index;
  while (i < encoded.length) {
    const value = decodeChar(encoded[i]);
    i += 1;
    result += (value & 0x1f) * Math.pow(2, shift); // tránh tràn 32-bit khi dịch bit
    if ((value & 0x20) === 0) {
      return [result, i];
    }
    shift += 5;
  }
  throw new Error('Flexible polyline: chuỗi bị cắt cụt');
}

function toSigned(value: number): number {
  // bit thấp nhất là dấu: 1 = âm
  return value % 2 === 1 ? -(value - 1) / 2 - 1 : value / 2;
}

export function decodeFlexPolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  if (!encoded) return [];

  let [version, index] = decodeUnsignedVarint(encoded, 0);
  if (version !== 1) {
    throw new Error(`Flexible polyline: phiên bản ${version} chưa được hỗ trợ`);
  }

  let header: number;
  [header, index] = decodeUnsignedVarint(encoded, index);
  const precision = header & 15;
  const thirdDim = (header >> 4) & 7;
  const hasThirdDim = thirdDim !== 0;
  const factor = Math.pow(10, precision);

  const points: Array<{ latitude: number; longitude: number }> = [];
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let value: number;

    [value, index] = decodeUnsignedVarint(encoded, index);
    lat += toSigned(value);
    [value, index] = decodeUnsignedVarint(encoded, index);
    lng += toSigned(value);
    if (hasThirdDim) {
      [, index] = decodeUnsignedVarint(encoded, index);
    }

    points.push({ latitude: lat / factor, longitude: lng / factor });
  }

  return points;
}
