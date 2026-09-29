import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GeoError } from 'react-native-geolocation-service';
import {
  DEBUG_FORCE_SPEED_LIMIT_KMH,
  ENABLE_MOCK_LOCATION_FALLBACK,
  MOCK_LOCATION_TIMEOUT_MS,
  OFF_ROUTE_CONSECUTIVE_FIXES,
  OVERSPEED_TOLERANCE_KMH,
  REROUTE_MIN_INTERVAL_MS,
} from '../config/AppConfig';
import { ensureLocationPermission, ensureNotificationPermission } from '../services/PermissionService';
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  updateBackgroundNotification,
} from '../services/BackgroundService';
import { startWatchingLocation, stopWatchingLocation } from '../services/LocationService';
import {
  startMockLocation,
  startRouteSimulation,
  stopMockLocation,
} from '../services/MockLocationService';
import { fetchRoute, RoutingError } from '../services/RoutingService';
import { RouteMatch, RouteTracker } from '../services/RouteTracker';
import {
  initVoiceAlert,
  speakOverspeedWarning,
  speakGuidance,
  getVoiceLanguage,
  stopVoiceAlert,
  getVoiceStatus,
  subscribeVoiceStatus,
  retryVoiceInitIfUnavailable,
  VoiceStatus,
} from '../services/VoiceAlertService';
import { GuidanceAnnouncer, guidanceSpeech, rerouteSpeech } from '../services/GuidanceAnnouncer';
import { VOICE_GUIDANCE_ENABLED } from '../config/AppConfig';
import { GpsData, LatLng, RoutePlan, TripPhase } from '../types';

export interface Destination extends LatLng {
  label: string;
}

export interface NavigationState {
  gps: GpsData | null;
  phase: TripPhase;
  destination: Destination | null;
  route: RoutePlan | null;
  routeLoading: boolean;
  /** true khi đang tính lại đường do lệch tuyến (chỉ có ý nghĩa ở pha navigating). */
  rerouting: boolean;
  match: RouteMatch | null;
  speedLimitKmh: number | null;
  isOverLimit: boolean;
  permissionDenied: boolean;
  errorMessage: string | null;
  voiceStatus: VoiceStatus;
  /** Chọn điểm đến và tính đường (pha idle/planning → planning). */
  setDestination: (destination: Destination) => Promise<void>;
  /** Bỏ điểm đến / huỷ tuyến đang xem trước (chỉ khi chưa khởi hành). */
  clearDestination: () => void;
  /** "Khởi hành": bắt đầu dẫn đường + BẬT cảnh báo quá tốc độ. */
  startTrip: () => Promise<void>;
  /** "Kết thúc": dừng dẫn đường + TẮT cảnh báo quá tốc độ + dừng chạy nền. */
  endTrip: () => Promise<void>;
}

export function useNavigation(): NavigationState {
  const [gps, setGps] = useState<GpsData | null>(null);
  const [phase, setPhase] = useState<TripPhase>('idle');
  const [destination, setDestinationState] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [match, setMatch] = useState<RouteMatch | null>(null);
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

  // ---- refs: để callback GPS (đăng ký 1 lần) luôn đọc được giá trị mới nhất ----
  const phaseRef = useRef<TripPhase>('idle');
  const gpsRef = useRef<GpsData | null>(null);
  const destinationRef = useRef<Destination | null>(null);
  const routeRef = useRef<RoutePlan | null>(null);
  const trackerRef = useRef<RouteTracker | null>(null);
  const announcerRef = useRef<GuidanceAnnouncer | null>(null);
  const routeRequestIdRef = useRef(0);
  const offRouteCountRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const reroutingRef = useRef(false);

  const watchIdRef = useRef<number | null>(null);
  const mockTimerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockActiveRef = useRef(false);
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivedRealGpsRef = useRef(false);
  const mountedRef = useRef(true);

  const applyRoute = useCallback((next: RoutePlan | null) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  const applyPhase = useCallback((next: TripPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // ------------------------------------------------------------------
  // Tính đường lại khi lệch tuyến (gọi Routing API — kèm luôn tốc độ giới hạn của tuyến mới).
  // Đây là lần gọi API DUY NHẤT trong lúc đang đi và chỉ xảy ra khi thật sự lệch tuyến.
  // ------------------------------------------------------------------
  const reroute = useCallback(
    async (from: GpsData) => {
      const dest = destinationRef.current;
      if (!dest || reroutingRef.current) return;

      reroutingRef.current = true;
      lastRerouteAtRef.current = Date.now();
      setRerouting(true);
      if (VOICE_GUIDANCE_ENABLED) speakGuidance(rerouteSpeech(getVoiceLanguage()));
      try {
        const next = await fetchRoute(from, dest);
        // Người dùng có thể đã bấm "Kết thúc" trong lúc chờ.
        if (!mountedRef.current || phaseRef.current !== 'navigating') return;
        trackerRef.current = new RouteTracker(next, DEBUG_FORCE_SPEED_LIMIT_KMH);
        announcerRef.current = new GuidanceAnnouncer(next, { announceStart: false });
        offRouteCountRef.current = 0;
        applyRoute(next);
        setErrorMessage(null);
      } catch (e) {
        const message = e instanceof RoutingError ? e.message : 'Không tính lại được đường đi.';
        if (mountedRef.current) setErrorMessage(message);
      } finally {
        reroutingRef.current = false;
        if (mountedRef.current) setRerouting(false);
      }
    },
    [applyRoute],
  );

  // ------------------------------------------------------------------
  // Mỗi lần có điểm GPS mới (thật hoặc giả lập).
  // ------------------------------------------------------------------
  const handleFix = useCallback(
    (data: GpsData) => {
      if (!mountedRef.current) return;
      gpsRef.current = data;
      setGps(data);

      // Chưa bấm "Khởi hành" (hoặc đã "Kết thúc") → chỉ hiển thị vị trí, KHÔNG cảnh báo.
      const tracker = trackerRef.current;
      if (phaseRef.current !== 'navigating' || !tracker) return;

      const result = tracker.update(data, data.accuracy);
      setMatch(result);

      // Tốc độ giới hạn đã có sẵn từ lúc tính đường → chỉ so sánh cục bộ, không gọi API.
      const limit = result.speedLimitKmh;
      if (limit !== null && data.speedKmh > limit + OVERSPEED_TOLERANCE_KMH) {
        speakOverspeedWarning(data.speedKmh, limit);
      }

      // Chỉ dẫn rẽ bằng giọng nói. Nếu bộ đọc đang bận (đọc cảnh báo tốc độ) thì bỏ qua lượt
      // này — chưa đánh dấu đã đọc, nên lần cập nhật GPS kế tiếp (≤1s sau) sẽ thử lại.
      if (VOICE_GUIDANCE_ENABLED) {
        const announcer = announcerRef.current;
        const candidate = announcer?.next(result, data.speedKmh) ?? null;
        if (candidate) {
          const spoken = speakGuidance(guidanceSpeech(candidate, getVoiceLanguage()));
          if (spoken) announcer!.markSpoken(candidate.key);
        }
      }

      // Lệch tuyến liên tiếp vài điểm mới tính lại đường (tránh GPS nhảy 1-2 điểm).
      if (result.offRoute && !result.arrived) {
        offRouteCountRef.current += 1;
        const now = Date.now();
        if (
          offRouteCountRef.current >= OFF_ROUTE_CONSECUTIVE_FIXES &&
          now - lastRerouteAtRef.current >= REROUTE_MIN_INTERVAL_MS
        ) {
          reroute(data);
        }
      } else {
        offRouteCountRef.current = 0;
      }
    },
    [reroute],
  );

  // ------------------------------------------------------------------
  // Nguồn GPS giả lập (chỉ dùng khi không có GPS thật và ENABLE_MOCK_LOCATION_FALLBACK = true)
  // ------------------------------------------------------------------
  const restartMock = useCallback(() => {
    if (!mockActiveRef.current) return;
    if (mockTimerIdRef.current !== null) {
      stopMockLocation(mockTimerIdRef.current);
      mockTimerIdRef.current = null;
    }
    const currentRoute = routeRef.current;
    mockTimerIdRef.current =
      phaseRef.current === 'navigating' && currentRoute
        ? startRouteSimulation(currentRoute, handleFix)
        : startMockLocation(handleFix);
  }, [handleFix]);

  const startFallbackMock = useCallback(() => {
    if (!ENABLE_MOCK_LOCATION_FALLBACK || mockActiveRef.current) return;
    if (watchIdRef.current !== null) {
      stopWatchingLocation(watchIdRef.current);
      watchIdRef.current = null;
    }
    mockActiveRef.current = true;
    restartMock();
  }, [restartMock]);

  // ------------------------------------------------------------------
  // Khởi tạo: quyền vị trí + theo dõi GPS (chỉ để hiện vị trí & làm điểm xuất phát)
  // ------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      await initVoiceAlert();
      const granted = await ensureLocationPermission();
      if (!mountedRef.current) return;

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
        receivedRealGpsRef.current = true;
        if (fallbackTimeoutRef.current !== null) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
        handleFix(data);
      };

      const onError = (error: GeoError) => {
        if (!mountedRef.current) return;
        setErrorMessage(error.message);
        startFallbackMock();
      };

      watchIdRef.current = startWatchingLocation(onUpdate, onError);

      // Emulator / thiết bị không phát tín hiệu tốc độ, hướng di chuyển thật thường
      // không bao giờ gọi onUpdate — nếu sau MOCK_LOCATION_TIMEOUT_MS vẫn chưa nhận được
      // GPS thật nào, chuyển sang dữ liệu giả lập để vẫn test được app.
      if (ENABLE_MOCK_LOCATION_FALLBACK) {
        fallbackTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current || receivedRealGpsRef.current) return;
          startFallbackMock();
        }, MOCK_LOCATION_TIMEOUT_MS);
      }
    })();

    return () => {
      mountedRef.current = false;
      if (watchIdRef.current !== null) stopWatchingLocation(watchIdRef.current);
      if (mockTimerIdRef.current !== null) stopMockLocation(mockTimerIdRef.current);
      if (fallbackTimeoutRef.current !== null) clearTimeout(fallbackTimeoutRef.current);
      stopBackgroundTracking();
    };
  }, [handleFix, startFallbackMock]);

  // ------------------------------------------------------------------
  // Hành động của người dùng
  // ------------------------------------------------------------------
  const setDestination = useCallback(
    async (dest: Destination) => {
      if (phaseRef.current === 'navigating') return; // đang đi thì phải "Kết thúc" trước
      const origin = gpsRef.current;
      if (!origin) {
        setErrorMessage('Chưa có vị trí GPS hiện tại để làm điểm xuất phát. Vui lòng đợi giây lát.');
        return;
      }

      const requestId = ++routeRequestIdRef.current;
      destinationRef.current = dest;
      setDestinationState(dest);
      setErrorMessage(null);
      setRouteLoading(true);
      applyRoute(null);
      applyPhase('planning');

      try {
        const plan = await fetchRoute(origin, dest);
        if (requestId !== routeRequestIdRef.current || !mountedRef.current) return; // đã chọn điểm khác
        applyRoute(plan);
      } catch (e) {
        if (requestId !== routeRequestIdRef.current || !mountedRef.current) return;
        setErrorMessage(e instanceof RoutingError ? e.message : 'Không tính được đường đi.');
      } finally {
        if (requestId === routeRequestIdRef.current && mountedRef.current) setRouteLoading(false);
      }
    },
    [applyPhase, applyRoute],
  );

  const clearDestination = useCallback(() => {
    if (phaseRef.current === 'navigating') return;
    routeRequestIdRef.current += 1; // huỷ yêu cầu tính đường đang chờ (nếu có)
    destinationRef.current = null;
    setDestinationState(null);
    applyRoute(null);
    setRouteLoading(false);
    setErrorMessage(null);
    applyPhase('idle');
  }, [applyPhase, applyRoute]);

  const startTrip = useCallback(async () => {
    const plan = routeRef.current;
    if (phaseRef.current !== 'planning' || !plan) return;

    // Toàn bộ tốc độ giới hạn dọc tuyến đã có trong `plan.segments` (lấy 1 lần lúc tính đường).
    trackerRef.current = new RouteTracker(plan, DEBUG_FORCE_SPEED_LIMIT_KMH);
    announcerRef.current = new GuidanceAnnouncer(plan, { announceStart: true });
    offRouteCountRef.current = 0;
    lastRerouteAtRef.current = 0;
    setMatch(null);
    setErrorMessage(null);
    applyPhase('navigating');

    // Nếu đang dùng GPS giả lập thì cho xe giả lập chạy dọc tuyến vừa tính.
    restartMock();

    // Bật chạy nền (foreground service) — phải gọi khi app đang ở foreground.
    await ensureNotificationPermission();
    if ((phaseRef.current as TripPhase) === 'navigating') await startBackgroundTracking();
  }, [applyPhase, restartMock]);

  const endTrip = useCallback(async () => {
    if (phaseRef.current !== 'navigating') return;

    applyPhase('idle'); // đặt trước để mọi điểm GPS đến sau đó không còn cảnh báo
    trackerRef.current = null;
    announcerRef.current = null;
    destinationRef.current = null;
    routeRequestIdRef.current += 1;
    offRouteCountRef.current = 0;
    setMatch(null);
    setDestinationState(null);
    setRerouting(false);
    setErrorMessage(null);
    applyRoute(null);

    stopVoiceAlert();
    restartMock(); // GPS giả lập (nếu có) quay lại chế độ đứng chơi quanh gốc
    await stopBackgroundTracking();
  }, [applyPhase, applyRoute, restartMock]);

  // ------------------------------------------------------------------
  // Giá trị dẫn xuất
  // ------------------------------------------------------------------
  const speedLimitKmh = phase === 'navigating' ? match?.speedLimitKmh ?? null : null;
  const isOverLimit =
    phase === 'navigating' &&
    gps !== null &&
    speedLimitKmh !== null &&
    gps.speedKmh > speedLimitKmh + OVERSPEED_TOLERANCE_KMH;

  // Hiển thị tốc độ hiện tại trên notification của chế độ chạy nền (chỉ khi đang dẫn đường).
  useEffect(() => {
    if (phase !== 'navigating' || !gps) return;
    const limitText = speedLimitKmh !== null ? ` / giới hạn ${speedLimitKmh}` : '';
    updateBackgroundNotification(
      `${Math.round(gps.speedKmh)} km/h${limitText}${isOverLimit ? ' ⚠ QUÁ TỐC ĐỘ' : ''}`,
    );
  }, [phase, gps, speedLimitKmh, isOverLimit]);

  return {
    gps,
    phase,
    destination,
    route,
    routeLoading,
    rerouting,
    match,
    speedLimitKmh,
    isOverLimit,
    permissionDenied,
    errorMessage,
    voiceStatus,
    setDestination,
    clearDestination,
    startTrip,
    endTrip,
  };
}
