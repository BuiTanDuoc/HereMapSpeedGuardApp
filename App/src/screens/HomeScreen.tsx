import React from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import HereMapView from '../components/HereMapView';
import SpeedInfoOverlay from '../components/SpeedInfoOverlay';
import { useSpeedGuard } from '../hooks/useSpeedGuard';

export default function HomeScreen() {
  const { gps, speedLimitKmh, isOverLimit, permissionDenied, errorMessage, voiceStatus, stopTracking } =
    useSpeedGuard();

  const handleStop = async () => {
    await stopTracking();
    BackHandler.exitApp();
  };

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
      <TouchableOpacity style={styles.stopButton} onPress={handleStop} activeOpacity={0.7}>
        <Text style={styles.stopButtonText}>⏻ Dừng & thoát</Text>
      </TouchableOpacity>
      <View style={styles.bottomBanners} pointerEvents="none">
        {voiceStatus.message && voiceStatus.state !== 'initializing' && (
          <View style={styles.voiceBanner}>
            <Text style={styles.voiceBannerText}>🔇 {voiceStatus.message}</Text>
          </View>
        )}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}
      </View>
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
  stopButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#0f1117dd',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#ffffff55',
  },
  stopButtonText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  bottomBanners: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  voiceBanner: {
    backgroundColor: '#7a4b00ee',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  voiceBannerText: { color: '#ffffff', fontSize: 12 },
  errorBanner: {
    backgroundColor: '#0f1117dd',
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText: { color: '#f7a04f', fontSize: 12 },
});
