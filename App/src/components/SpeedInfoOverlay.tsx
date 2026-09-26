import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GpsData } from '../types';

interface Props {
  gps: GpsData | null;
  speedLimitKmh: number | null;
  isOverLimit: boolean;
}

export default function SpeedInfoOverlay({ gps, speedLimitKmh, isOverLimit }: Props) {
  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={styles.infoBox}>
        <Text style={styles.speedText}>
          {gps ? `${Math.round(gps.speedKmh)} km/h` : '-- km/h'}
        </Text>
        <Text style={styles.subText}>
          {gps
            ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
            : 'Đang lấy vị trí...'}
        </Text>
        <Text style={styles.subText}>
          Hướng: {gps?.heading !== null && gps?.heading !== undefined ? `${Math.round(gps.heading)}°` : '--'}
        </Text>
        {speedLimitKmh !== null && (
          <Text style={styles.subText}>Tốc độ cho phép: {speedLimitKmh} km/h</Text>
        )}
        {gps?.isMock && <Text style={styles.mockTag}>● DỮ LIỆU GIẢ LẬP (TEST)</Text>}
      </View>

      {isOverLimit && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>⚠ QUÁ TỐC ĐỘ CHO PHÉP</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  infoBox: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#0f1117dd',
    borderRadius: 10,
    padding: 12,
    minWidth: 160,
  },
  speedText: {
    color: '#4f8ef7',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subText: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 2,
  },
  mockTag: {
    color: '#f7a04f',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 6,
  },
  warningBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#d0342c',
    paddingVertical: 14,
    paddingTop: 40,
    alignItems: 'center',
  },
  warningText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
