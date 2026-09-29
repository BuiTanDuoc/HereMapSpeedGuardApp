# CLAUDE.md

Hướng dẫn cho Claude Code (hoặc bất kỳ ai) khi làm việc tiếp trên project này.

## Project là gì

**HereSpeedGuardApp** — app React Native (Android, chưa test iOS) chỉ đường bằng HERE Maps và
cảnh báo quá tốc độ bằng giọng nói trong lúc lái xe. Toàn bộ giao diện tiếng Việt.

- React Native 0.86.0, React 19.2.3, TypeScript.
- Bản đồ: HERE Raster Tile API v3 + Leaflet, chạy trong `react-native-webview` (không dùng HERE
  Maps JS SDK — SDK đó nặng và hay crash âm thầm trong WebView, xem lý do trong
  `HereMapView.tsx`).
- Chỉ đường: HERE Routing API v8.
- Tìm địa điểm: HERE Discover API (Geocoding & Search).
- Giọng nói: `react-native-tts`.
- Chạy nền: `react-native-background-actions` (foreground service Android).
- Quyền: `react-native-permissions`.
- GPS: `react-native-geolocation-service`, có fallback GPS giả lập khi test trên emulator.

## Tính năng chính

1. **Tìm điểm đến**: gõ chữ (HERE Discover, ưu tiên kết quả ở Việt Nam) hoặc chạm thẳng lên
   bản đồ.
2. **Tính đường** (HERE Routing v8, gọi 1 lần khi chọn điểm đến): trả về polyline (Flexible
   Polyline, tự giải mã ở `utils/flexPolyline.ts`), thời gian, khoảng cách, chỉ dẫn rẽ, và
   **tốc độ giới hạn của từng đoạn đường dọc tuyến** (`spans=maxSpeed`, đơn vị m/s → đổi ra
   km/h). Đây là điểm quan trọng: **không có API riêng để tra tốc độ theo từng điểm GPS** — tốc
   độ giới hạn lấy trọn vẹn từ lần gọi Routing này.
3. **Khởi hành / Kết thúc** — máy trạng thái `idle → planning → navigating`
   (`hooks/useNavigation.ts`). Cảnh báo quá tốc độ và chỉ dẫn rẽ **chỉ hoạt động ở pha
   `navigating`**, tức là giữa lúc bấm "▶ Khởi hành" và "■ Kết thúc".
4. **Theo dõi tuyến cục bộ, không gọi mạng** (`services/RouteTracker.ts`): mỗi điểm GPS mới được
   chiếu lên polyline đã tính sẵn để biết đang ở đoạn nào, từ đó tra tốc độ giới hạn hoàn toàn
   trong máy. Phát hiện lệch tuyến (dựa cả vào độ chính xác GPS) và tự tính lại đường
   (`RoutingService.fetchRoute`) nếu lệch liên tục — đây là lần gọi API **duy nhất** khác ngoài
   lúc chọn điểm đến.
5. **Cảnh báo quá tốc độ**: so sánh tốc độ GPS hiện tại với tốc độ giới hạn của đoạn đang đi,
   đọc bằng giọng nói + hiện chữ trên overlay (`components/SpeedInfoOverlay.tsx`).
6. **Đọc chỉ dẫn rẽ bằng giọng nói** (`services/GuidanceAnnouncer.ts`): nhắc **xa** rồi nhắc
   **gần** trước mỗi chỗ rẽ (ngưỡng co giãn theo tốc độ xe), đọc câu xuất phát lúc vừa khởi hành,
   đọc "đã đến nơi", đọc "đang tính lại đường" khi lệch tuyến. Thuần logic, tách khỏi TTS nên
   test được độc lập.
7. **Chạy nền** (`services/BackgroundService.ts`): foreground service Android để GPS + cảnh báo
   vẫn chạy khi tắt màn hình / chuyển app khác.
8. **GPS giả lập để test** (`services/MockLocationService.ts`): trước khi khởi hành, xe giả lập
   chạy loanh quanh gốc; sau khi khởi hành, xe giả lập **chạy dọc theo tuyến đã tính** (tốc độ
   dao động 0–80 km/h) để test được cảnh báo + chỉ dẫn mà không cần GPS thật.

## Cấu trúc file quan trọng

```
src/
  config/AppConfig.ts          — TOÀN BỘ tham số chỉnh được (API key, ngưỡng lệch tuyến,
                                  ngưỡng nhắc đường, GPS giả lập, debug ép cứng tốc độ...)
  hooks/useNavigation.ts       — "bộ não": máy trạng thái, gọi RoutingService/RouteTracker/
                                  GuidanceAnnouncer/VoiceAlertService, gác quyền trước khi
                                  bật chạy nền
  services/
    RoutingService.ts          — gọi HERE Routing v8 + Discover; parseRouteResponse (test
                                  được riêng, không cần mạng)
    RouteTracker.ts            — chiếu GPS lên tuyến, tra tốc độ, phát hiện lệch tuyến/đến nơi
    GuidanceAnnouncer.ts       — quyết định KHI NÀO đọc chỉ dẫn rẽ (không đụng TTS)
    VoiceAlertService.ts       — wrapper Tts, 2 kênh (overspeed/guidance) không cắt lời nhau
    BackgroundService.ts       — foreground service; options.foregroundServiceType phải khớp
                                  Manifest (xem mục "Bẫy" bên dưới)
    PermissionService.ts       — xin/kiểm tra quyền vị trí, thông báo
    LocationService.ts / MockLocationService.ts — nguồn GPS thật / giả lập
  components/
    HereMapView.tsx            — WebView chứa Leaflet + HERE raster tile
    SpeedInfoOverlay.tsx        — hiện tốc độ hiện tại + giới hạn
  screens/HomeScreen.tsx        — màn hình duy nhất, ghép toàn bộ UI
  utils/flexPolyline.ts, geo.ts, format.ts
```

## Trước khi build/chạy

- `AppConfig.ts`: `HERE_API_KEY` đang để placeholder `'YOUR_HERE_API_KEY'`. Key cần bật ít nhất:
  Routing v8, Geocoding & Search (Discover), Raster Tile API v3.
- `npm install` lại (không commit `node_modules`).
- Android: `compileSdkVersion`/`targetSdkVersion` = **36** (rất mới, gần như Android 15/16).

## Bẫy đã gặp — đọc kỹ trước khi sửa các file liên quan

### 1. `Tts.speak()` là hàm ĐỒNG BỘ, không phải Promise
`react-native-tts`: `speak()` trả về `string | number` (id câu nói), KHÔNG trả Promise.
`stop()`/`getInitStatus()`/`requestInstallEngine()` thì CÓ trả Promise. Gọi `.then()/.catch()`
lên kết quả của `speak()` sẽ ném `TypeError` đồng bộ ngay lập tức — crash app ngay khi có câu
đầu tiên cần đọc, và vì xảy ra trong callback GPS (không phải lúc render) nên **không hiện
thành lỗi đỏ JS, dev tools không thấy log gì**. Xử lý đúng: bọc `try/catch`, không `.catch()`.
Xem `VoiceAlertService.ts` hàm `speakNow()`.

Test coverage: `__tests__/voiceAlertService.test.ts` — mock `Tts.speak()` trả về `number` y hệt
thực tế để bắt đúng loại lỗi này (KHÔNG mock nó trả Promise, sẽ che mất bug).

### 2. Foreground service kiểu `"location"` trên Android 14+ (API 34+)
`react-native-background-actions` yêu cầu **cả hai** điều kiện cùng lúc, thiếu 1 trong 2 là
Android giết tiến trình ngay (crash native, không qua JS, không có log):
- JS: `options.foregroundServiceType: ['location']` khi gọi `BackgroundService.start()`.
- Manifest: `android:foregroundServiceType="location"` trên thẻ `<service>` tương ứng
  (`AndroidManifest.xml`).
- Runtime: app phải **đang thực sự giữ** quyền `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`
  tại đúng lúc gọi — không đủ nếu chỉ khai trong Manifest.

`useNavigation.ts` đã gọi `hasLocationPermission()` (check, không xin lại) ngay trước khi bật
chạy nền và bỏ qua an toàn nếu thiếu quyền — nhưng nếu sau này đổi cách gọi
`BackgroundService.start()`, nhớ giữ nguyên `foregroundServiceType` khớp Manifest.

Đây cũng là lý do điển hình gặp **"máy ảo crash, máy thật (Android cũ hơn) lại chạy OK"**: máy
ảo mới cài Android bản mới hơn máy thật đang test, nên bị áp luật nghiêm ngặt của Android 14+
còn máy thật thì không.

### 3. Bẫy hoisting khi viết test cho module dùng `jest.mock`
Không tham chiếu biến khai báo bên ngoài (`const mockXxx = {...}`) trong factory của
`jest.mock()` nếu muốn assert vào nó ở nơi khác — `jest.mock()` bị hoist lên đầu file, factory
chạy TRƯỚC dòng khai báo biến, và babel của project hạ cấp `let/const` xuống `var` nên mất luôn
bảo vệ temporal-dead-zone: biến trả về `undefined` **âm thầm, không throw**, khiến bug rất khó
phát hiện (test "pass" nhưng thực chất không test được gì). Cách an toàn: định nghĩa mock hoàn
toàn bên trong factory, rồi lấy lại tham chiếu qua chính câu `import X from 'module'` ở dưới.
Xem đầu file `__tests__/voiceAlertService.test.ts` để có ví dụ đúng.

## Test

```
npx tsc --noEmit          # còn đúng 1 lỗi có sẵn từ đầu ở HereMapView.tsx (kiểu WebView), không
                           # liên quan logic — chưa sửa
npx eslint src __tests__ --ext .ts,.tsx
npx jest                  # __tests__/App.test.tsx lỗi sẵn từ đầu (react-native-webview không
                           # parse được trong môi trường jest hiện tại) — không liên quan
```

30 test tự viết (routing, route tracking, giọng nói, hook điều phối, smoke test màn hình) đều
đạt tính đến lần cập nhật gần nhất. Khi sửa `useNavigation.ts` hay `PermissionService.ts`, nhớ
cập nhật mock `PermissionService`/`VoiceAlertService`/`BackgroundService` ở **cả 2** file
`__tests__/useNavigation.test.tsx` và `__tests__/HomeScreen.test.tsx` (hai file mock độc lập
nhau, dễ quên 1 trong 2).

## Việc chưa làm / giới hạn đã biết

- Chưa build/chạy thật trên thiết bị hay emulator trong quá trình phát triển — mọi xác nhận đều
  qua `tsc`/`eslint`/`jest` với service bên ngoài (HERE, TTS, GPS, foreground service) được mock.
- Chưa test trên iOS.
- Câu chỉ dẫn rẽ đọc nguyên văn `instruction` HERE trả về — không tự viết lại câu tự nhiên hơn
  hay đọc chi tiết làn đường/vòng xuyến.
- `HereMapView.tsx` còn 1 lỗi kiểu (`tsc`) liên quan overload của `WebView` — có sẵn từ bản gốc,
  chưa ảnh hưởng chạy thực tế nên chưa động vào.
