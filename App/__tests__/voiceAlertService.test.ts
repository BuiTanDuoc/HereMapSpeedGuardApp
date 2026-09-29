// Mock react-native-tts KHỚP ĐÚNG kiểu dữ liệu thật của thư viện: speak() là hàm ĐỒNG BỘ,
// trả về string|number (id câu nói) — KHÔNG phải Promise. Đây chính là điểm dễ gây crash nếu
// code gọi .then()/.catch() lên giá trị trả về của speak() (xem VoiceAlertService.ts).
//
// ⚠️ Định nghĩa mock HOÀN TOÀN bên trong factory (không tham chiếu biến khai báo bên ngoài).
// jest.mock() bị hoist lên đầu file nên factory chạy TRƯỚC các dòng `const`/`let` phía dưới —
// tham chiếu biến ngoài ở đây sẽ nhận `undefined` một cách im lặng (không throw) vì babel của
// project hạ cấp let/const xuống var, mất luôn bảo vệ temporal-dead-zone. Muốn assert vào các
// jest.fn() bên trong, lấy lại chúng qua chính `import Tts from 'react-native-tts'` ở dưới.
jest.mock('react-native-tts', () => ({
  __esModule: true,
  default: {
    getInitStatus: jest.fn().mockResolvedValue('success'),
    setDefaultLanguage: jest.fn().mockResolvedValue('success'),
    setDefaultRate: jest.fn().mockResolvedValue('success'),
    requestInstallEngine: jest.fn().mockResolvedValue('success'),
    stop: jest.fn().mockResolvedValue(true),
    speak: jest.fn(() => 1), // giống hệt thực tế: trả về number, KHÔNG có .then/.catch
  },
}));

import Tts from 'react-native-tts';
import {
  initVoiceAlert,
  speakOverspeedWarning,
  speakGuidance,
  stopVoiceAlert,
  getVoiceLanguage,
} from '../src/services/VoiceAlertService';

const mockTts = Tts as unknown as {
  getInitStatus: jest.Mock;
  setDefaultLanguage: jest.Mock;
  setDefaultRate: jest.Mock;
  requestInstallEngine: jest.Mock;
  stop: jest.Mock;
  speak: jest.Mock;
};

describe('VoiceAlertService — không được throw khi gọi Tts.speak() (trả về đồng bộ, không phải Promise)', () => {
  beforeEach(async () => {
    mockTts.speak.mockClear();
    mockTts.stop.mockClear();
    stopVoiceAlert(); // đưa bộ đếm giãn cách + trạng thái "đang bận" về 0 trước mỗi test
    mockTts.stop.mockClear(); // bỏ qua lệnh gọi Tts.stop() phát sinh từ dòng trên
    await initVoiceAlert();
  });

  it('đã khởi tạo thành công với mock (không rơi vào trạng thái unavailable)', () => {
    expect(mockTts.getInitStatus).toHaveBeenCalled();
  });

  it('speakOverspeedWarning không throw và có gọi Tts.speak', () => {
    expect(() => speakOverspeedWarning(80, 50)).not.toThrow();
    expect(mockTts.speak).toHaveBeenCalledTimes(1);
    expect(mockTts.speak.mock.calls[0][0]).toContain('50');
  });

  it('speakGuidance không throw, trả về true khi đọc được', () => {
    let ok = false;
    expect(() => {
      ok = speakGuidance('Rẽ trái vào đường A.');
    }).not.toThrow();
    expect(ok).toBe(true);
    expect(mockTts.speak).toHaveBeenCalledWith('Rẽ trái vào đường A.', expect.any(Object));
  });

  it('stopVoiceAlert không throw (Tts.stop trả Promise thật nên .catch hợp lệ)', () => {
    expect(() => stopVoiceAlert()).not.toThrow();
    expect(mockTts.stop).toHaveBeenCalled();
  });

  it('gọi liên tiếp nhiều lần không throw (mô phỏng nhiều điểm GPS liên tục)', () => {
    expect(() => {
      for (let i = 0; i < 20; i++) {
        speakGuidance(`Câu chỉ dẫn số ${i}`);
        speakOverspeedWarning(70 + i, 50);
      }
    }).not.toThrow();
  });

  it('ngôn ngữ mặc định là vi-VN khi setDefaultLanguage("vi-VN") thành công', () => {
    expect(getVoiceLanguage()).toBe('vi-VN');
  });
});
