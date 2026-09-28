import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GpsData } from '../types';

interface Props {
  gps: GpsData | null;
  speedLimitKmh: number | null;
  isOverLimit: boolean;
  /** Khoảng cách (px) từ mép trên màn hình tới khối thông tin — để né thanh tìm kiếm / banner chỉ dẫn. */
  topOffset?: number;
}

export default function SpeedInfoOverlay({ gps, speedLimitKmh, isOverLimit, topOffset = 16 }: Props) {
  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={[styles.infoBox, { top: topOffset }]}>
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

      {isOverLimit && gps && speedLimitKmh !== null && (
        <View style={styles.warningContainer}>
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠ QUÁ TỐC ĐỘ CHO PHÉP</Text>
            <View style={styles.warningRow}>
              <View style={styles.warningCol}>
                <Text style={styles.warningLabel}>Hiện tại</Text>
                <Text style={styles.warningCurrent}>{Math.round(gps.speedKmh)}</Text>
              </View>
              <Text style={styles.warningSlash}>/</Text>
              <View style={styles.warningCol}>
                <Text style={styles.warningLabel}>Cho phép</Text>
                <Text style={styles.warningLimit}>{speedLimitKmh}</Text>
              </View>
            </View>
            <Text style={styles.warningUnit}>km/h</Text>
          </View>
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
  // Cảnh báo đặt giữa màn hình, không che khối thông tin tốc độ ở góc trên trái
  warningContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningCard: {
    backgroundColor: '#d0342cee',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  warningTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  warningCol: {
    alignItems: 'center',
    minWidth: 80,
  },
  warningLabel: {
    color: '#ffe3e0',
    fontSize: 12,
  },
  warningCurrent: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: 'bold',
  },
  warningLimit: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  warningSlash: {
    color: '#ffffff',
    fontSize: 36,
    marginHorizontal: 8,
  },
  warningUnit: {
    color: '#ffe3e0',
    fontSize: 13,
    marginTop: 2,
  },
});
