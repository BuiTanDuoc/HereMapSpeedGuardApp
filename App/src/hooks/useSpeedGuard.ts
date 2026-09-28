import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GeoError } from 'react-native-geolocation-service';
import {
  SPEED_CHECK_THRESHOLD_KMH,
  SPEED_CHECK_DELTA_KMH,
  SPEED_CHECK_MIN_INTERVAL_MS,
  ENABLE_MOCK_LOCATION_FALLBACK,
  MOCK_LOCATION_TIMEOUT_MS,
  RATE_LIMIT_DEFAULT_COOLDOWN_MS,
  RATE_LIMIT_MAX_COOLDOWN_MS,
  DEBUG_FORCE_SPEED_LIMIT_KMH,
} from '../config/AppConfig';
import { ensureLocationPermission, ensureNotificationPermission } from '../services/PermissionService';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  updateBackgroundNotification,
} from '../services/BackgroundService';
import { startWatchingLocation, stopWatchingLocation } from '../services/LocationService';
import { startMockLocation, stopMockLocation } from '../services/MockLocationService';
import { fetchSpeedLimit } from '../services/SpeedLimitService';
import {
  initVoiceAlert,
  speakOverspeedWarning,
  getVoiceStatus,
  subscribeVoiceStatus,
  retryVoiceInitIfUnavailable,
  VoiceStatus,
} from '../services/VoiceAlertService';
import { GpsData } from '../types';

export interface SpeedGuardState {
  gps: GpsData | null;
  speedLimitKmh: number | null;
  isOverLimit: boolean;
  permissionDenied: boolean;
  errorMessage: string | null;
  voiceStatus: VoiceStatus;
  /** Dừng chạy nền (tắt notification + foreground service). */
  stopTracking: () => Promise<void>;
}

export function useSpeedGuard(): SpeedGuardState {
  const [gps, setGps] = useState<GpsData | null>(null);
  const [speedLimitKmh, setSpeedLimitKmh] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(getVoiceStatus());

  // Theo dõi trạng thái TTS; khi quay lại app (vd. vừa cài xong TTS engine) thì thử khởi tạo lại.
  useEffect(() => {
    const unsubscribe = subscribeVoiceStatus(setVoiceStatus);
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') retryVoiceInitIfUnavailable();
    });
    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

  // Tốc độ (km/h) tại lần gọi API gần nhất — dùng để tính độ lệch ±5km/h
  const lastCheckedSpeedRef = useRef<number | null>(null);
  const lastCheckedAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const mockTimerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivedRealGpsRef = useRef(false);
  // Nếu HERE trả 429, không gọi lại API cho tới mốc thời gian này
  const cooldownUntilRef = useRef<number>(0);
  // Số lần bị 429 liên tiếp — dùng để tăng dần thời gian nghỉ (exponential backoff)
  const rateLimitStreakRef = useRef<number>(0);

  const maybeCheckSpeedLimit = useCallback(async (data: GpsData) => {
    const { speedKmh, latitude, longitude } = data;

    if (speedKmh <= SPEED_CHECK_THRESHOLD_KMH) {
      // Về tốc độ an toàn: reset mốc so sánh để lần vượt ngưỡng tiếp theo luôn được kiểm tra
      lastCheckedSpeedRef.current = null;
      return;
    }

    // 🧪 Chế độ debug: ép cứng tốc độ giới hạn, bỏ qua hoàn toàn gọi HERE API.
    if (DEBUG_FORCE_SPEED_LIMIT_KMH !== null) {
      console.log(
        `[useSpeedGuard] [DEBUG] Dùng tốc độ giới hạn ép cứng = ${DEBUG_FORCE_SPEED_LIMIT_KMH}km/h (tốc độ hiện tại: ${speedKmh.toFixed(1)}km/h)`,
      );
      setSpeedLimitKmh(DEBUG_FORCE_SPEED_LIMIT_KMH);
      if (speedKmh > DEBUG_FORCE_SPEED_LIMIT_KMH) {
        speakOverspeedWarning(speedKmh, DEBUG_FORCE_SPEED_LIMIT_KMH);
      }
      return;
    }

    const now = Date.now();

    if (now < cooldownUntilRef.current) {
      // Đang trong thời gian "nghỉ" do bị HERE trả 429 trước đó — bỏ qua, không gọi tiếp.
      console.log(
        `[useSpeedGuard] Bỏ qua kiểm tra (đang cooldown do 429, còn ${Math.round((cooldownUntilRef.current - now) / 1000)}s)`,
      );
      return;
    }

    const last = lastCheckedSpeedRef.current;
    const speedChanged = last === null || Math.abs(speedKmh - last) >= SPEED_CHECK_DELTA_KMH;
    const enoughTimePassed = now - lastCheckedAtRef.current >= SPEED_CHECK_MIN_INTERVAL_MS;

    if (!speedChanged || !enoughTimePassed || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    lastCheckedSpeedRef.current = speedKmh;
    lastCheckedAtRef.current = now;

    console.log(
      `[useSpeedGuard] Tốc độ hiện tại ${speedKmh.toFixed(1)}km/h > ngưỡng — gọi API kiểm tra tốc độ giới hạn tại (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
    );

    const result = await fetchSpeedLimit(latitude, longitude);
    inFlightRef.current = false;

    if (result.rateLimited) {
      rateLimitStreakRef.current += 1;
      const backoffMs =
        RATE_LIMIT_DEFAULT_COOLDOWN_MS * Math.pow(2, rateLimitStreakRef.current - 1);
      const cooldownMs = result.retryAfterMs ?? Math.min(backoffMs, RATE_LIMIT_MAX_COOLDOWN_MS);
      cooldownUntilRef.current = Date.now() + cooldownMs;
      console.warn(
        `[useSpeedGuard] Bị 429 lần thứ ${rateLimitStreakRef.current} liên tiếp — nghỉ ${Math.round(cooldownMs / 1000)}s trước khi thử lại.`,
      );
      return;
    }

    rateLimitStreakRef.current = 0;

    if (result.speedLimitKmh !== null) {
      console.log(`[useSpeedGuard] Tốc độ giới hạn nhận được: ${result.speedLimitKmh}km/h`);
      setSpeedLimitKmh(result.speedLimitKmh);
      if (speedKmh > result.speedLimitKmh) {
        speakOverspeedWarning(speedKmh, result.speedLimitKmh);
      }
    } else {
      console.log('[useSpeedGuard] Không lấy được tốc độ giới hạn (API không có dữ liệu tuyến đường tại vị trí này).');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const startFallbackMock = () => {
      if (!ENABLE_MOCK_LOCATION_FALLBACK || mockTimerIdRef.current !== null) return;
      if (watchIdRef.current !== null) {
        stopWatchingLocation(watchIdRef.current);
        watchIdRef.current = null;
      }
      mockTimerIdRef.current = startMockLocation(data => {
        if (!mounted) return;
        setGps(data);
        maybeCheckSpeedLimit(data);
      });
    };

    (async () => {
      await initVoiceAlert();
      const granted = await ensureLocationPermission();
      if (!mounted) return;

      if (granted) {
        // Bật chế độ chạy nền (foreground service). Không await để không chặn việc lấy GPS.
        ensureNotificationPermission().then(() => {
          if (mounted) startBackgroundTracking();
        });
      }

      if (!granted) {
        if (ENABLE_MOCK_LOCATION_FALLBACK) {
          // Không có quyền vị trí (thường gặp khi test nhanh trên emulator) —
          // vẫn cho chạy bằng dữ liệu giả lập để test luồng UI/cảnh báo.
          startFallbackMock();
        } else {
          setPermissionDenied(true);
        }
        return;
      }

      const onUpdate = (data: GpsData) => {
        if (!mounted) return;
        receivedRealGpsRef.current = true;
        if (fallbackTimeoutRef.current !== null) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
        setGps(data);
        maybeCheckSpeedLimit(data);
      };

      const onError = (error: GeoError) => {
        if (!mounted) return;
        setErrorMessage(error.message);
        startFallbackMock();
      };

      watchIdRef.current = startWatchingLocation(onUpdate, onError);

      // Emulator / thiết bị không phát tín hiệu tốc độ, hướng di chuyển thật thường
      // không bao giờ gọi onUpdate (hoặc chỉ trả 1 toạ độ cố định không đổi) — nếu
      // sau MOCK_LOCATION_TIMEOUT_MS vẫn chưa nhận được GPS thật nào, chuyển sang
      // dữ liệu giả lập để vẫn test được app.
      if (ENABLE_MOCK_LOCATION_FALLBACK) {
        fallbackTimeoutRef.current = setTimeout(() => {
          if (!mounted || receivedRealGpsRef.current) return;
          startFallbackMock();
        }, MOCK_LOCATION_TIMEOUT_MS);
      }
    })();

    return () => {
      mounted = false;
      if (watchIdRef.current !== null) {
        stopWatchingLocation(watchIdRef.current);
      }
      if (mockTimerIdRef.current !== null) {
        stopMockLocation(mockTimerIdRef.current);
      }
      if (fallbackTimeoutRef.current !== null) {
        clearTimeout(fallbackTimeoutRef.current);
      }
    };
  }, [maybeCheckSpeedLimit]);

  const isOverLimit =
    gps !== null && speedLimitKmh !== null && gps.speedKmh > speedLimitKmh;

  // Hiển thị tốc độ hiện tại trên notification của chế độ chạy nền
  useEffect(() => {
    if (!gps) return;
    const limitText = speedLimitKmh !== null ? ` / giới hạn ${speedLimitKmh}` : '';
    updateBackgroundNotification(
      `${Math.round(gps.speedKmh)} km/h${limitText}${isOverLimit ? ' ⚠ QUÁ TỐC ĐỘ' : ''}`,
    );
  }, [gps, speedLimitKmh, isOverLimit]);

  const stopTracking = useCallback(async () => {
    await stopBackgroundTracking();
  }, []);

  return {
    gps,
    speedLimitKmh,
    isOverLimit,
    permissionDenied,
    errorMessage,
    voiceStatus,
    stopTracking,
  };
}
