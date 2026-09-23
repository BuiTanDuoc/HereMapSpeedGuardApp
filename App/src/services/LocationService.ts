import Geolocation, {
  GeoPosition,
  GeoError,
} from 'react-native-geolocation-service';
import { LOCATION_OPTIONS } from '../config/AppConfig';
import { GpsData } from '../types';

function toGpsData(position: GeoPosition): GpsData {
  const { latitude, longitude, speed, heading, accuracy } = position.coords;
  return {
    latitude,
    longitude,
    // speed từ API gốc là m/s, có thể null/-1 khi thiết bị đứng yên hoặc không xác định được
    speedKmh: speed && speed > 0 ? speed * 3.6 : 0,
    heading: heading !== null && heading >= 0 ? heading : null,
    accuracy,
    timestamp: position.timestamp,
  };
}

/**
 * Bắt đầu theo dõi vị trí GPS liên tục.
 * Trả về watchId, dùng để huỷ theo dõi bằng stopWatchingLocation().
 */
export function startWatchingLocation(
  onUpdate: (data: GpsData) => void,
  onError: (error: GeoError) => void,
): number {
  return Geolocation.watchPosition(
    position => onUpdate(toGpsData(position)),
    onError,
    {
      enableHighAccuracy: LOCATION_OPTIONS.enableHighAccuracy,
      distanceFilter: LOCATION_OPTIONS.distanceFilter,
      interval: LOCATION_OPTIONS.interval,
      fastestInterval: LOCATION_OPTIONS.fastestInterval,
      forceRequestLocation: true,
      showLocationDialog: true,
    },
  );
}

export function stopWatchingLocation(watchId: number): void {
  Geolocation.clearWatch(watchId);
}
