import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { HERE_API_KEY } from '../config/AppConfig';

interface Props {
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
}

/**
 * Hiển thị vị trí hiện tại trên bản đồ HERE bằng Leaflet + HERE Raster Tile API v3
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
export default function HereMapView({ latitude, longitude, heading }: Props) {
  const webViewRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    if (!mapReadyRef.current || latitude === null || longitude === null) return;
    const js = `
      window.updateCurrentLocation(${latitude}, ${longitude}, ${heading ?? 'null'});
      true;
    `;
    webViewRef.current?.injectJavaScript(js);
  }, [latitude, longitude, heading]);

  const html = buildHtml();

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={event => {
          const raw = event.nativeEvent.data;
          if (raw === 'map-ready') {
            mapReadyRef.current = true;
            if (latitude !== null && longitude !== null) {
              webViewRef.current?.injectJavaScript(
                `window.updateCurrentLocation(${latitude}, ${longitude}, ${heading ?? 'null'}); true;`,
              );
            }
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.type === 'error') {
              console.warn('[HereMapView] Lỗi trong WebView bản đồ:', parsed.message);
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
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
  <script>
    function reportError(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: message }));
      }
    }
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
        var marker = null;

        window.updateCurrentLocation = function (lat, lng, heading) {
          var latLng = [lat, lng];
          if (!marker) {
            marker = L.marker(latLng, { icon: markerIcon }).addTo(map);
          } else {
            marker.setLatLng(latLng);
          }
          map.setView(latLng);
        };

        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage('map-ready');
        }
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
