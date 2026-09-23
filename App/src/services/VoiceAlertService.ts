import Tts from 'react-native-tts';

let initialized = false;
let lastSpokenAt = 0;
const MIN_GAP_BETWEEN_WARNINGS_MS = 8000;

export async function initVoiceAlert(): Promise<void> {
  if (initialized) return;
  try {
    await Tts.setDefaultLanguage('vi-VN');
  } catch {
    // Một số máy không có giọng tiếng Việt cài sẵn, fallback English
    await Tts.setDefaultLanguage('en-US');
  }
  Tts.setDefaultRate(0.5);
  initialized = true;
}

/**
 * Đọc cảnh báo vượt tốc độ. Có giới hạn tần suất để không đọc liên tục gây khó chịu.
 */
export function speakOverspeedWarning(currentKmh: number, limitKmh: number): void {
  const now = Date.now();
  if (now - lastSpokenAt < MIN_GAP_BETWEEN_WARNINGS_MS) {
    return;
  }
  lastSpokenAt = now;

  const text = `Cảnh báo, bạn đang chạy quá tốc độ cho phép. Tốc độ hiện tại ${Math.round(
    currentKmh,
  )} ki lô mét trên giờ. Tốc độ tối đa ${Math.round(limitKmh)} ki lô mét trên giờ.`;

  Tts.stop();
  Tts.speak(text);
}
