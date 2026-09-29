import Tts from 'react-native-tts';

/**
 * Trạng thái giọng nói, để UI hiển thị cảnh báo cuối màn hình khi TTS không dùng được.
 * - initializing: đang khởi tạo
 * - ready: dùng được (nếu có `message` nghĩa là dùng được nhưng có lưu ý, ví dụ
 *   máy chưa có giọng tiếng Việt nên phải đọc tiếng Anh)
 * - unavailable: không dùng được giọng nói, `message` là hướng dẫn cho người dùng
 */
export interface VoiceStatus {
  state: 'initializing' | 'ready' | 'unavailable';
  language?: 'vi-VN' | 'en-US';
  message?: string;
}

const INIT_TIMEOUT_MS = 8000;
const MIN_GAP_BETWEEN_WARNINGS_MS = 8000;

let status: VoiceStatus = { state: 'initializing' };
let initPromise: Promise<void> | null = null;
let lastSpokenAt = 0;
const listeners = new Set<(s: VoiceStatus) => void>();

function setStatus(next: VoiceStatus) {
  status = next;
  listeners.forEach(l => l(status));
}

export function getVoiceStatus(): VoiceStatus {
  return status;
}

export function subscribeVoiceStatus(listener: (s: VoiceStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Khởi tạo TTS, không bao giờ throw. Kết quả nằm trong getVoiceStatus().
 * Lỗi "TTS is not ready" thường do gọi setDefaultLanguage()/speak() trước khi engine
 * khởi tạo xong, hoặc máy chưa có TTS engine / chưa khai báo <queries> trong
 * AndroidManifest (Android 11+ sẽ không thấy engine nếu thiếu).
 */
export function initVoiceAlert(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setStatus({ state: 'initializing' });

    try {
      await withTimeout(Tts.getInitStatus(), INIT_TIMEOUT_MS);
    } catch (err: any) {
      const reason = err?.code ?? err?.message ?? 'unknown';
      console.warn('[VoiceAlertService] Không khởi tạo được TTS:', err);
      setStatus({
        state: 'unavailable',
        message:
          reason === 'no_engine'
            ? 'Máy chưa có bộ đọc giọng nói (Text-to-Speech). Hãy cài "Google Text-to-Speech" từ CH Play, rồi quay lại app.'
            : `Không khởi tạo được giọng nói (${reason}). Cảnh báo chỉ hiển thị bằng chữ.`,
      });
      if (err?.code === 'no_engine') {
        // Mở màn hình cài engine (Android). Bỏ qua nếu không mở được.
        Tts.requestInstallEngine().catch(() => {});
      }
      return;
    }

    try {
      await Tts.setDefaultLanguage('vi-VN');
      setStatus({ state: 'ready', language: 'vi-VN' });
    } catch (viErr) {
      console.warn('[VoiceAlertService] Không có giọng tiếng Việt:', viErr);
      try {
        await Tts.setDefaultLanguage('en-US');
        setStatus({
          state: 'ready',
          language: 'en-US',
          message:
            'Máy chưa có giọng tiếng Việt nên cảnh báo được đọc bằng tiếng Anh. Vào Cài đặt > Text-to-speech > Google > Cài đặt dữ liệu giọng nói để tải tiếng Việt.',
        });
      } catch (enErr) {
        console.warn('[VoiceAlertService] Không đặt được ngôn ngữ TTS:', enErr);
        setStatus({
          state: 'unavailable',
          message: 'Bộ đọc giọng nói chưa có dữ liệu ngôn ngữ nào. Cảnh báo chỉ hiển thị bằng chữ.',
        });
        return;
      }
    }

    try {
      Tts.setDefaultRate(0.5);
    } catch {
      // Không ảnh hưởng chức năng chính.
    }
  })();

  return initPromise;
}

/** Thử khởi tạo lại (ví dụ sau khi người dùng vừa cài xong TTS engine và quay lại app). */
export function retryVoiceInitIfUnavailable(): void {
  if (status.state === 'unavailable') {
    initPromise = null;
    initVoiceAlert();
  }
}

/**
 * Hai "kênh" dùng chung 1 bộ đọc: cảnh báo quá tốc độ và chỉ dẫn rẽ. Để không cắt lời nhau:
 *  - Đang đọc cảnh báo tốc độ → chỉ dẫn rẽ chờ (trả false, lần cập nhật GPS sau sẽ thử lại).
 *  - Đang đọc chỉ dẫn rẽ → cảnh báo tốc độ chờ (không tính vào giãn cách 8s, sẽ đọc ngay sau đó).
 *  - Chỉ dẫn rẽ mới được phép thay chỉ dẫn rẽ cũ đang đọc dở (vd. "gần rẽ" thay "còn 500m").
 * Thời gian đọc được ước lượng theo độ dài câu (không phụ thuộc sự kiện của engine TTS).
 */
type Channel = 'overspeed' | 'guidance';
let busyChannel: Channel | null = null;
let busyUntil = 0;

const SPEECH_BASE_MS = 1500;
const SPEECH_MS_PER_CHAR = 90;

function isBusy(channel: Channel, now: number): boolean {
  return busyChannel === channel && now < busyUntil;
}

function speakNow(text: string, channel: Channel, now: number): void {
  busyChannel = channel;
  busyUntil = now + SPEECH_BASE_MS + text.length * SPEECH_MS_PER_CHAR;

  // ⚠️ Tts.speak() là hàm ĐỒNG BỘ, trả về id (string | number) của câu nói — KHÔNG
  // phải Promise. Không được gọi .then/.catch lên giá trị này (sẽ ném TypeError
  // "catch is not a function" ngay lập tức). Tts.stop() thì NGƯỢC LẠI, có trả về
  // Promise<boolean> nên dùng .catch được bình thường.
  try {
    Tts.stop().catch(() => {});
    Tts.speak(text, {
      iosVoiceId: '',
      rate: 0.5,
      androidParams: {
        KEY_PARAM_PAN: 0,
        KEY_PARAM_VOLUME: 1,
        KEY_PARAM_STREAM: 'STREAM_MUSIC',
      },
    });
  } catch (err) {
    console.warn('[VoiceAlertService] Lỗi khi đọc:', err);
  }
}

/**
 * Đọc cảnh báo vượt tốc độ (giới hạn tần suất). Nếu TTS chưa sẵn sàng thì bỏ qua êm.
 */
export function speakOverspeedWarning(currentKmh: number, limitKmh: number): void {
  if (status.state !== 'ready') return;

  const now = Date.now();
  if (now - lastSpokenAt < MIN_GAP_BETWEEN_WARNINGS_MS) return;
  if (isBusy('guidance', now)) return; // chờ đọc xong chỉ dẫn rẽ, chưa tính là đã cảnh báo
  lastSpokenAt = now;

  const current = Math.round(currentKmh);
  const limit = Math.round(limitKmh);
  const text =
    status.language === 'en-US'
      ? `Warning, you are over the speed limit. Current speed ${current} kilometers per hour. Limit ${limit}.`
      : `Cảnh báo, bạn đang chạy quá tốc độ cho phép. Tốc độ hiện tại ${current} ki lô mét trên giờ. Tốc độ tối đa ${limit} ki lô mét trên giờ.`;

  speakNow(text, 'overspeed', now);
}

/** Ngôn ngữ giọng đọc hiện tại (để dựng câu chỉ dẫn đúng ngôn ngữ). */
export function getVoiceLanguage(): 'vi-VN' | 'en-US' {
  return status.language ?? 'vi-VN';
}

/**
 * Đọc chỉ dẫn rẽ. Trả về true nếu ĐÃ đọc (hoặc đưa vào bộ đọc), false nếu chưa đọc được
 * (TTS chưa sẵn sàng / đang đọc cảnh báo tốc độ) — bên gọi nên thử lại ở lần cập nhật sau.
 */
export function speakGuidance(text: string): boolean {
  if (status.state !== 'ready' || text.length === 0) return false;

  const now = Date.now();
  if (isBusy('overspeed', now)) return false;

  speakNow(text, 'guidance', now);
  return true;
}

/** Ngắt giọng đang đọc và reset bộ đếm — gọi khi kết thúc chuyến đi. */
export function stopVoiceAlert(): void {
  lastSpokenAt = 0;
  busyChannel = null;
  busyUntil = 0;
  if (status.state !== 'ready') return;
  Tts.stop().catch(() => {});
}
