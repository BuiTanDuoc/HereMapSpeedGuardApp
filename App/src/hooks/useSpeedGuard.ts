import { useCallback, useEffect, useRef, useState } from 'react';
import { GeoError } from 'react-native-geolocation-service';
import {
  SPEED_CHECK_THRESHOLD_KMH,
  SPEED_CHECK_DELTA_KMH,
  SPEED_CHECK_MIN_INTERVAL_MS,
} from '../config/AppConfig';
import { ensureLocationPermission } from '../services/PermissionService';
import { startWatchingLocation, stopWatchingLocation } from '../services/LocationService';
import { fetchSpeedLimit } from '../services/SpeedLimitService';
import { initVoiceAlert, speakOverspeedWarning } from '../services/VoiceAlertService';
import { GpsData } from '../types';

export interface SpeedGuardState {
  gps: GpsData | null;
  speedLimitKmh: number | null;
  isOverLimit: boolean;
  permissionDenied: boolean;
  errorMessage: string | null;
}

export function useSpeedGuard(): SpeedGuardState {
  const [gps, setGps] = useState<GpsData | null>(null);
  const [speedLimitKmh, setSpeedLimitKmh] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tốc độ (km/h) tại lần gọi API gần nhất — dùng để tính độ lệch ±5km/h
  const lastCheckedSpeedRef = useRef<number | null>(null);
  const lastCheckedAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);

  const maybeCheckSpeedLimit = useCallback(async (data: GpsData) => {
    const { speedKmh, latitude, longitude } = data;

    if (speedKmh <= SPEED_CHECK_THRESHOLD_KMH) {
      // Về tốc độ an toàn: reset mốc so sánh để lần vượt ngưỡng tiếp theo luôn được kiểm tra
      lastCheckedSpeedRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastCheckedSpeedRef.current;
    const speedChanged = last === null || Math.abs(speedKmh - last) >= SPEED_CHECK_DELTA_KMH;
    const enoughTimePassed = now - lastCheckedAtRef.current >= SPEED_CHECK_MIN_INTERVAL_MS;

    if (!speedChanged || !enoughTimePassed || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    lastCheckedSpeedRef.current = speedKmh;
    lastCheckedAtRef.current = now;

    const result = await fetchSpeedLimit(latitude, longitude);
    inFlightRef.current = false;

    if (result.speedLimitKmh !== null) {
      setSpeedLimitKmh(result.speedLimitKmh);
      if (speedKmh > result.speedLimitKmh) {
        speakOverspeedWarning(speedKmh, result.speedLimitKmh);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      await initVoiceAlert();
      const granted = await ensureLocationPermission();
      if (!mounted) return;

      if (!granted) {
        setPermissionDenied(true);
        return;
      }

      const onUpdate = (data: GpsData) => {
        if (!mounted) return;
        setGps(data);
        maybeCheckSpeedLimit(data);
      };

      const onError = (error: GeoError) => {
        if (!mounted) return;
        setErrorMessage(error.message);
      };

      watchIdRef.current = startWatchingLocation(onUpdate, onError);
    })();

    return () => {
      mounted = false;
      if (watchIdRef.current !== null) {
        stopWatchingLocation(watchIdRef.current);
      }
    };
  }, [maybeCheckSpeedLimit]);

  const isOverLimit =
    gps !== null && speedLimitKmh !== null && gps.speedKmh > speedLimitKmh;

  return { gps, speedLimitKmh, isOverLimit, permissionDenied, errorMessage };
}
