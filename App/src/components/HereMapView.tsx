import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { HERE_API_KEY } from '../config/AppConfig';
import { LatLng } from '../types';

interface Props {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  /** Tuyến đường cần vẽ (null = không vẽ). */
  routePath: LatLng[] | null;
  /** Điểm đến (null = không hiện ghim). */
  destination: LatLng | null;
  /** true khi đang dẫn đường: bản đồ luôn bám theo vị trí xe. */
  follow: boolean;
  /** Tăng giá trị này để đưa bản đồ về vị trí hiện tại. */
  recenterKey: number;
  /** true: chạm lên bản đồ sẽ gọi onSelectPoint (dùng để chọn điểm đến). */
  selectable: boolean;
  onSelectPoint?: (point: LatLng) => void;
}

/**
 * Hiển thị vị trí hiện tại + tuyến đường trên bản đồ HERE bằng Leaflet + HERE Raster Tile API v3
 * chạy trong WebView.
 *
 * Trước đây dùng HERE Maps JavaScript API (SDK đầy đủ) nhưng SDK này khá nặng,
 * dùng nhiều tính năng JS hiện đại + WebGL, dễ throw lỗi runtime ngay trong lúc
 * tự thực thi (top-level) trên WebView của một số emulator/thiết bị cũ — mà lỗi
 * loại này bị trình duyệt che dấu chi tiết ("Script error.") do chạy từ domain
 * khác, rất khó debug.
 *
 * Leaflet là thư viện bản đồ rất nhẹ, ổn định, tương thích WebView tốt hơn nhiều.
 * HERE có hướng dẫn chính thức tích hợp Leaflet qua Raster Tile API v3:
 * https://docs.here.com/map-rendering/docs/example-leaflet
 */
export default function HereMapView({
  latitude,
  longitude,
  heading,
  routePath,
  destination,
  follow,
  recenterKey,
  selectable,
  onSelectPoint,
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const followRef = useRef(follow);
  followRef.current = follow;
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;

  const html = useMemo(() => buildHtml(), []);

  const run = (js: string) => webViewRef.current?.injectJavaScript(`${js}; true;`);

  // Vị trí hiện tại
  useEffect(() => {
    if (!ready || latitude === null || longitude === null) return;
    run(`window.updateCurrentLocation(${latitude}, ${longitude}, ${heading ?? 'null'}, ${follow})`);
  }, [ready, latitude, longitude, heading, follow]);

  // Tuyến đường (vẽ lại khi có tuyến mới; chỉ tự thu phóng vừa tuyến khi chưa dẫn đường)
  useEffect(() => {
    if (!ready) return;
    if (!routePath || routePath.length < 2) {
      run('window.setRoute(null, false)');
      return;
    }
    const coords = JSON.stringify(routePath.map(p => [p.latitude, p.longitude]));
    run(`window.setRoute(${coords}, ${!followRef.current})`);
  }, [ready, routePath]);

  // Ghim điểm đến
  const destLat = destination?.latitude ?? null;
  const destLng = destination?.longitude ?? null;
  useEffect(() => {
    if (!ready) return;
    run(
      destLat !== null && destLng !== null
        ? `window.setDestination(${destLat}, ${destLng})`
        : 'window.setDestination(null, null)',
    );
  }, [ready, destLat, destLng]);

  // Cho phép / không cho phép chạm để chọn điểm
  useEffect(() => {
    if (!ready) return;
    run(`window.setSelectable(${selectable})`);
  }, [ready, selectable]);

  // Nút "về vị trí của tôi"
  useEffect(() => {
    if (!ready || recenterKey === 0) return;
    run('window.recenter()');
  }, [ready, recenterKey]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={(event: { nativeEvent: { data: string } }) => {
          const raw = event.nativeEvent.data;
          if (raw === 'map-ready') {
            setReady(true);
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.type === 'error') {
              console.warn('[HereMapView] Lỗi trong WebView bản đồ:', parsed.message);
            } else if (parsed?.type === 'select') {
              onSelectPointRef.current?.({ latitude: parsed.lat, longitude: parsed.lng });
            }
          } catch {
            // Không phải JSON — bỏ qua.
          }
        }}
      />
    </View>
  );
}

function buildHtml(): string {
  // HERE Raster Tile API v3 — https://docs.here.com/map-rendering/docs/example-leaflet
  const tileUrl = `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?size=256&style=explore.day&apiKey=${HERE_API_KEY}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0f1117; }
    .speed-marker {
      width: 18px; height: 18px; border-radius: 50%;
      background: #4f8ef7; border: 3px solid #ffffff;
      box-shadow: 0 0 6px rgba(0,0,0,0.5);
    }
    .dest-marker {
      width: 20px; height: 20px; border-radius: 50% 50% 50% 0;
      background: #d0342c; border: 3px solid #ffffff;
      transform: rotate(-45deg);
      box-shadow: 0 0 6px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
  <script>
    function post(obj) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(typeof obj === 'string' ? obj : JSON.stringify(obj));
      }
    }
    function reportError(message) { post({ type: 'error', message: message }); }
    window.onerror = function (message, source, lineno, colno, error) {
      reportError(String(message) + ' @' + (source || '?') + ':' + lineno + ':' + colno);
    };

    try {
      if (typeof L === 'undefined') {
        reportError('Leaflet (biến L) chưa được load — kiểm tra kết nối mạng của WebView.');
      } else {
        var map = L.map('map', { zoomControl: true, attributionControl: true })
          .setView([10.7769, 106.7009], 16);

        L.tileLayer('${tileUrl}', {
          maxZoom: 20,
          attribution: '&copy; HERE',
        }).addTo(map);

        var markerIcon = L.divIcon({ className: 'speed-marker', iconSize: [18, 18] });
        var destIcon = L.divIcon({ className: 'dest-marker', iconSize: [20, 20], iconAnchor: [10, 20] });
        var marker = null;
        var destMarker = null;
        var routeLine = null;
        var routeCasing = null;
        var centeredOnce = false;
        var wasFollowing = false;
        var selectable = false;

        window.updateCurrentLocation = function (lat, lng, heading, follow) {
          var latLng = [lat, lng];
          if (!marker) {
            marker = L.marker(latLng, { icon: markerIcon, zIndexOffset: 1000 }).addTo(map);
          } else {
            marker.setLatLng(latLng);
          }
          if (follow) {
            // Vừa vào chế độ dẫn đường: phóng gần 1 lần; sau đó giữ mức zoom người dùng chọn.
            var zoom = wasFollowing ? map.getZoom() : Math.max(map.getZoom(), 17);
            map.setView(latLng, zoom, { animate: false });
            wasFollowing = true;
          } else {
            wasFollowing = false;
            if (!centeredOnce) {
              map.setView(latLng, 16, { animate: false });
              centeredOnce = true;
            }
          }
        };

        window.setRoute = function (coords, fit) {
          if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
          if (routeCasing) { map.removeLayer(routeCasing); routeCasing = null; }
          if (!coords || coords.length < 2) return;
          routeCasing = L.polyline(coords, { color: '#ffffff', weight: 10, opacity: 0.9 }).addTo(map);
          routeLine = L.polyline(coords, { color: '#1a73e8', weight: 6, opacity: 1 }).addTo(map);
          if (fit) map.fitBounds(routeLine.getBounds(), { padding: [70, 70] });
        };

        window.setDestination = function (lat, lng) {
          if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
          if (lat === null || lng === null) return;
          destMarker = L.marker([lat, lng], { icon: destIcon }).addTo(map);
        };

        window.setSelectable = function (value) { selectable = !!value; };

        window.recenter = function () {
          if (marker) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
        };

        map.on('click', function (e) {
          if (!selectable) return;
          post({ type: 'select', lat: e.latlng.lat, lng: e.latlng.lng });
        });

        post('map-ready');
      }
    } catch (err) {
      reportError('Init error: ' + (err && err.message ? err.message : String(err)));
    }
  </script>
</body>
</html>
  `;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
