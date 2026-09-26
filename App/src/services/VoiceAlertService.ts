import Tts from 'react-native-tts';

let ttsReady = false;
let initPromise: Promise<void> | null = null;
let lastSpokenAt = 0;
const MIN_GAP_BETWEEN_WARNINGS_MS = 8000;

/**
 * Khởi tạo TTS. Lỗi "TTS is not ready" xảy ra khi gọi setDefaultLanguage()/speak()
 * trước khi engine TTS init xong — rất hay gặp trên emulator vì:
 * (1) engine load chậm hơn code, hoặc
 * (2) emulator không cài sẵn TTS engine nào (thường thiếu Google Play Services).
 * Hàm này chờ Tts.getInitStatus() trước, và luôn bắt lỗi (không throw ra ngoài) —
 * nếu không có engine, app vẫn chạy bình thường, chỉ không đọc được cảnh báo bằng
 * giọng nói (banner cảnh báo bằng chữ trong SpeedInfoOverlay vẫn hiện đầy đủ).
 */
export async function initVoiceAlert(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Tts.getInitStatus();
      ttsReady = true;
    } catch (err: any) {
      ttsReady = false;
      if (err?.code === 'no_engine') {
        // Android: thử mở màn hình cài TTS engine. Trên emulator không có Google
        // Play thường sẽ không cài được — bỏ qua, không throw.
        try {
          await Tts.requestInstallEngine();
        } catch {
          // Người dùng huỷ, hoặc không có Play Store trên emulator — bỏ qua.
        }
      }
      console.warn(
        '[VoiceAlertService] TTS engine chưa sẵn sàng (bỏ qua, chỉ dùng cảnh báo chữ):',
        err,
      );
      return;
    }

    try {
      await Tts.setDefaultLanguage('vi-VN');
    } catch {
      try {
        // Một số máy không có giọng tiếng Việt cài sẵn, fallback English
        await Tts.setDefaultLanguage('en-US');
      } catch (err) {
        console.warn('[VoiceAlertService] Không đặt được ngôn ngữ TTS:', err);
      }
    }

    try {
      Tts.setDefaultRate(0.5);
    } catch {
      // Bỏ qua nếu engine không hỗ trợ — không ảnh hưởng chức năng chính.
    }
  })();

  return initPromise;
}

/**
 * Đọc cảnh báo vượt tốc độ. Có giới hạn tần suất để không đọc liên tục gây khó chịu.
 * Nếu TTS chưa sẵn sàng (chưa init xong hoặc máy không có engine), hàm này bỏ qua
 * êm — không throw, không có promise nào bị "Uncaught".
 */
export function speakOverspeedWarning(currentKmh: number, limitKmh: number): void {
  if (!ttsReady) return;

  const now = Date.now();
  if (now - lastSpokenAt < MIN_GAP_BETWEEN_WARNINGS_MS) {
    return;
  }
  lastSpokenAt = now;

  const text = `Cảnh báo, bạn đang chạy quá tốc độ cho phép. Tốc độ hiện tại ${Math.round(
    currentKmh,
  )} ki lô mét trên giờ. Tốc độ tối đa ${Math.round(limitKmh)} ki lô mét trên giờ.`;

  Tts.stop().catch(() => {});
  Tts.speak(text).catch(err => {
    console.warn('[VoiceAlertService] Lỗi khi đọc cảnh báo:', err);
  });
}
