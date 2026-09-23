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
 * Hiển thị vị trí hiện tại trên HERE Map bằng HERE Maps JavaScript API
 * chạy trong WebView (không cần link native HERE SDK cho Android/iOS).
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
        onMessage={event => {
          if (event.nativeEvent.data === 'map-ready') {
            mapReadyRef.current = true;
            if (latitude !== null && longitude !== null) {
              webViewRef.current?.injectJavaScript(
                `window.updateCurrentLocation(${latitude}, ${longitude}, ${heading ?? 'null'}); true;`,
              );
            }
          }
        }}
      />
    </View>
  );
}

function buildHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  </style>
  <script src="https://js.api.here.com/v3/3.1/mapsjs-core.js"></script>
  <script src="https://js.api.here.com/v3/3.1/mapsjs-service.js"></script>
  <script src="https://js.api.here.com/v3/3.1/mapsjs-mapevents.js"></script>
  <script src="https://js.api.here.com/v3/3.1/mapsjs-ui.js"></script>
  <link rel="stylesheet" type="text/css" href="https://js.api.here.com/v3/3.1/mapsjs-ui.css" />
</head>
<body>
  <div id="map"></div>
  <script>
    var platform = new H.service.Platform({ apikey: '${HERE_API_KEY}' });
    var defaultLayers = platform.createDefaultLayers();
    var map = new H.Map(
      document.getElementById('map'),
      defaultLayers.vector.normal.map,
      { zoom: 16, center: { lat: 10.7769, lng: 106.7009 } }
    );
    window.addEventListener('resize', function () { map.getViewPort().resize(); });
    new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
    H.ui.UI.createDefault(map, defaultLayers);

    var marker = null;

    window.updateCurrentLocation = function (lat, lng, heading) {
      var position = { lat: lat, lng: lng };
      if (!marker) {
        marker = new H.map.Marker(position);
        map.addObject(marker);
        map.setCenter(position);
      } else {
        marker.setGeometry(position);
        map.setCenter(position);
      }
    };

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage('map-ready');
    }
  </script>
</body>
</html>
  `;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
