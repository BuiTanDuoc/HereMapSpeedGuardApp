import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import HereMapView from '../components/HereMapView';
import SpeedInfoOverlay from '../components/SpeedInfoOverlay';
import { MOCK_LOCATION_ORIGIN } from '../config/AppConfig';
import { useNavigation } from '../hooks/useNavigation';
import { RoutingError, searchPlaces } from '../services/RoutingService';
import { LatLng, PlaceResult } from '../types';
import { formatDistance, formatDuration } from '../utils/format';

const SEARCH_DEBOUNCE_MS = 450;

export default function HomeScreen() {
  const {
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
  } = useNavigation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);

  // Vị trí dùng để ưu tiên kết quả tìm kiếm gần người dùng. Giữ trong ref để gõ tìm kiếm
  // không bị chạy lại mỗi giây theo GPS.
  const nearRef = useRef<LatLng>(MOCK_LOCATION_ORIGIN);
  if (gps) nearRef.current = { latitude: gps.latitude, longitude: gps.longitude };

  // Tìm địa điểm (debounce) — chỉ khi chưa khởi hành.
  useEffect(() => {
    if (phase === 'navigating') return;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(text, nearRef.current);
        if (cancelled) return;
        setResults(found);
        setSearchError(found.length === 0 ? 'Không tìm thấy địa điểm phù hợp.' : null);
      } catch (e) {
        if (cancelled) return;
        setResults([]);
        setSearchError(e instanceof RoutingError ? e.message : 'Không tìm được địa điểm.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, phase]);

  const routePath = useMemo(() => route?.points ?? null, [route]);

  const pickPlace = (place: PlaceResult) => {
    Keyboard.dismiss();
    setQuery('');
    setResults([]);
    setSearchError(null);
    setDestination({ ...place.position, label: place.title });
  };

  const pickPoint = (point: LatLng) => {
    setQuery('');
    setResults([]);
    setDestination({
      ...point,
      label: `Điểm đã chọn (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`,
    });
  };

  const cancelPlanning = () => {
    setQuery('');
    clearDestination();
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

  const navigating = phase === 'navigating';
  const showSearch = !navigating;
  const showResults = showSearch && (results.length > 0 || searching || searchError !== null);

  // Còn lại bao xa / bao lâu (ước lượng theo tỉ lệ quãng đường còn lại)
  const remainingMeters = match?.remainingMeters ?? route?.totalMeters ?? 0;
  const remainingSeconds =
    route && route.totalMeters > 0 ? route.totalSeconds * (remainingMeters / route.totalMeters) : 0;

  return (
    <View style={styles.container}>
      <HereMapView
        latitude={gps?.latitude ?? null}
        longitude={gps?.longitude ?? null}
        heading={gps?.heading ?? null}
        routePath={routePath}
        destination={destination}
        follow={navigating}
        recenterKey={recenterKey}
        selectable={!navigating}
        onSelectPoint={pickPoint}
      />

      <SpeedInfoOverlay
        gps={gps}
        speedLimitKmh={speedLimitKmh}
        isOverLimit={isOverLimit}
        topOffset={navigating ? 104 : 72}
      />

      {/* Thanh tìm điểm đến (ẩn khi đang dẫn đường) */}
      {showSearch && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm điểm đến hoặc chạm lên bản đồ"
              placeholderTextColor="#8a90a0"
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching ? (
              <ActivityIndicator color="#4f8ef7" />
            ) : query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {showResults && (
            <View style={styles.resultsBox}>
              {results.map(place => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.resultRow}
                  onPress={() => pickPlace(place)}
                  activeOpacity={0.6}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {place.title}
                  </Text>
                  <Text style={styles.resultAddress} numberOfLines={1}>
                    {place.address}
                  </Text>
                </TouchableOpacity>
              ))}
              {searchError && <Text style={styles.searchError}>{searchError}</Text>}
            </View>
          )}
        </View>
      )}

      {/* Banner chỉ dẫn rẽ (khi đang dẫn đường) */}
      {navigating && (
        <View style={styles.instructionBanner} pointerEvents="none">
          {rerouting ? (
            <Text style={styles.instructionText}>Đang tính lại đường...</Text>
          ) : match?.arrived ? (
            <Text style={styles.instructionText}>🏁 Bạn đã đến nơi</Text>
          ) : match?.offRoute ? (
            <Text style={styles.instructionText}>Bạn đang lệch khỏi tuyến đường</Text>
          ) : match?.nextInstruction ? (
            <>
              <Text style={styles.instructionDistance}>
                {formatDistance(match.nextInstruction.distanceM)}
              </Text>
              <Text style={styles.instructionText} numberOfLines={2}>
                {match.nextInstruction.text}
              </Text>
            </>
          ) : (
            <Text style={styles.instructionText}>Đi theo tuyến đường</Text>
          )}
        </View>
      )}

      {/* Nút về vị trí của tôi */}
      {!navigating && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={() => setRecenterKey(k => k + 1)}
          activeOpacity={0.7}>
          <Text style={styles.recenterText}>⌖</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomArea} pointerEvents="box-none">
        <View pointerEvents="none">
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

        {/* Xem trước tuyến: chọn "Khởi hành" để bắt đầu + bật cảnh báo quá tốc độ */}
        {phase === 'planning' && destination && (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {destination.label}
            </Text>

            {routeLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#4f8ef7" />
                <Text style={styles.cardSub}>Đang tính đường...</Text>
              </View>
            ) : route ? (
              <Text style={styles.cardSub}>
                {formatDuration(route.totalSeconds)} · {formatDistance(route.totalMeters)}
              </Text>
            ) : (
              <Text style={styles.cardSub}>Chưa có tuyến đường.</Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={cancelPlanning}
                activeOpacity={0.7}>
                <Text style={styles.buttonText}>Huỷ</Text>
              </TouchableOpacity>
              {!routeLoading && !route ? (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={() => setDestination(destination)}
                  activeOpacity={0.7}>
                  <Text style={styles.buttonText}>Thử lại</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton, (!route || routeLoading) && styles.disabledButton]}
                  onPress={startTrip}
                  disabled={!route || routeLoading}
                  activeOpacity={0.7}>
                  <Text style={styles.buttonText}>▶ Khởi hành</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Đang dẫn đường: "Kết thúc" để dừng dẫn đường + tắt cảnh báo */}
        {navigating && (
          <View style={styles.card}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {destination?.label ?? 'Đang dẫn đường'}
            </Text>
            <Text style={styles.cardSub}>
              Còn {formatDistance(remainingMeters)} · khoảng {formatDuration(remainingSeconds)}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.stopButton]}
                onPress={endTrip}
                activeOpacity={0.7}>
                <Text style={styles.buttonText}>■ Kết thúc</Text>
              </TouchableOpacity>
            </View>
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

  searchWrap: { position: 'absolute', top: 12, left: 12, right: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1117ee',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff33',
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: '#ffffff', fontSize: 15, paddingVertical: 10 },
  clearText: { color: '#ffffffaa', fontSize: 16, paddingLeft: 8 },
  resultsBox: {
    marginTop: 6,
    backgroundColor: '#0f1117f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff33',
    overflow: 'hidden',
  },
  resultRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ffffff22',
  },
  resultTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  resultAddress: { color: '#ffffff99', fontSize: 12, marginTop: 2 },
  searchError: { color: '#f7a04f', fontSize: 12, padding: 12 },

  instructionBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: '#1a73e8ee',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 64,
    justifyContent: 'center',
  },
  instructionDistance: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  instructionText: { color: '#ffffff', fontSize: 15 },

  recenterButton: {
    position: 'absolute',
    right: 16,
    bottom: 200,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0f1117dd',
    borderWidth: 1,
    borderColor: '#ffffff55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterText: { color: '#ffffff', fontSize: 24, marginTop: -2 },

  bottomArea: { position: 'absolute', bottom: 16, left: 16, right: 16 },
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
    marginBottom: 8,
  },
  errorBannerText: { color: '#f7a04f', fontSize: 12 },

  card: {
    backgroundColor: '#0f1117f2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ffffff33',
    padding: 14,
  },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  cardSub: { color: '#ffffffcc', fontSize: 14, marginTop: 4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: { backgroundColor: '#1a73e8' },
  secondaryButton: { backgroundColor: '#ffffff22' },
  stopButton: { backgroundColor: '#d0342c' },
  disabledButton: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
});
