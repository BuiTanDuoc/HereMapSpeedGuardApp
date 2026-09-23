import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import HereMapView from '../components/HereMapView';
import SpeedInfoOverlay from '../components/SpeedInfoOverlay';
import { useSpeedGuard } from '../hooks/useSpeedGuard';

export default function HomeScreen() {
  const { gps, speedLimitKmh, isOverLimit, permissionDenied, errorMessage } = useSpeedGuard();

  if (permissionDenied) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Ứng dụng cần quyền truy cập vị trí (GPS) để hoạt động. Vui lòng cấp quyền
          trong Cài đặt.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HereMapView
        latitude={gps?.latitude ?? null}
        longitude={gps?.longitude ?? null}
        heading={gps?.heading ?? null}
      />
      <SpeedInfoOverlay gps={gps} speedLimitKmh={speedLimitKmh} isOverLimit={isOverLimit} />
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1117' },
  center: {
    flex: 1,
    backgroundColor: '#0f1117',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: { color: '#ffffff', textAlign: 'center', fontSize: 15 },
  errorBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#0f1117dd',
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText: { color: '#f7a04f', fontSize: 12 },
});
