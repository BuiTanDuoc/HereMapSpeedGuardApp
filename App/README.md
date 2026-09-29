# HereSpeedGuard

Ứng dụng React Native CLI: theo dõi GPS (toạ độ, tốc độ, hướng di chuyển), hiển thị
vị trí trên HERE Map, và cảnh báo (chữ + giọng nói) khi vượt tốc độ cho phép.

Đây là **mã nguồn**, chưa phải project đã chạy `npx react-native init` — cần ghép vào
một project RN CLI thật vì môi trường tạo file này không chạy được `npm`/`react-native`
CLI (build native Android/iOS).

## 1. Tạo project RN CLI và copy source

```bash
npx react-native init HereSpeedGuard --version 0.86.0
```

> Bản 0.86 không có breaking change so với 0.85 và chưa bật Strict TypeScript API
> mặc định (điều đó chỉ áp dụng từ 0.87 trở đi), nên code trong gói này chạy được
> ngay không cần chỉnh sửa gì thêm cho tương thích API.

Sau đó copy đè các file/thư mục sau từ gói này vào project vừa tạo:
- `App.tsx`
- `src/`
- `package.json` → merge phần `dependencies`/`devDependencies` vào file `package.json`
  mà `react-native init` đã sinh ra (đừng ghi đè hoàn toàn, vì file gốc còn cấu hình
  Jest/Metro khác theo đúng version RN của bạn).

## 2. Cài dependency

```bash
npm install
cd ios && pod install && cd ..   # nếu build iOS
```

⚠️ `react-native-safe-area-context` là native module mới thêm vào (thay cho
`SafeAreaView` cũ đã deprecated trong `react-native`) — nếu build Android báo lỗi
thiếu module này sau khi merge `package.json`, chạy lại `npm install` rồi build lại;
với iOS nhớ chạy lại `pod install`.

## 3. Khai báo quyền vị trí

- Android: mở `android/app/src/main/AndroidManifest.xml`, thêm nội dung trong
  `android-AndroidManifest-additions.xml` (đặt trước thẻ `<application>`).
- iOS: mở `ios/HereSpeedGuard/Info.plist`, thêm nội dung trong
  `ios-Info-plist-additions.xml`.

**Giọng nói (Android)**: ngoài `<uses-permission>`, phải thêm khối `<queries>` (có trong
`android-AndroidManifest-additions.xml`) — Android 11+ nếu thiếu sẽ không thấy TTS engine.
Trên điện thoại cần có bộ đọc **Google Text-to-Speech** (CH Play) kèm dữ liệu giọng
**Tiếng Việt** (Cài đặt > Hệ thống > Ngôn ngữ & nhập liệu > Đầu ra chuyển văn bản thành
giọng nói > Google > Cài đặt dữ liệu giọng nói). Nếu không dùng được giọng nói, app hiện
banner cảnh báo ở cuối màn hình. Emulator thường không có giọng đọc, nên test trên máy thật.

## 4. Cấu hình HERE API Key

Mở `src/config/AppConfig.ts`, thay `YOUR_HERE_API_KEY` bằng key thật lấy tại
https://platform.here.com (dùng cho cả HERE Maps JS API hiển thị bản đồ, và API
tra cứu tốc độ cho phép).

⚠️ **API key cần bật**: Routing v8, Geocoding & Search (Discover), Raster Tile API v3.

## 4b. Chỉ đường + cảnh báo quá tốc độ (luồng sử dụng)

1. Gõ tên địa điểm ở ô tìm kiếm (HERE Discover API) **hoặc chạm thẳng lên bản đồ** để chọn điểm đến.
2. App gọi **HERE Routing API v8 một lần** để lấy tuyến đường + tốc độ giới hạn của từng đoạn
   đường dọc tuyến (`spans=maxSpeed`, trả về m/s, app đổi sang km/h). Bản đồ vẽ tuyến, hiện thời gian/quãng đường.
3. Bấm **▶ Khởi hành**: bắt đầu dẫn đường (bản đồ bám theo xe, banner chỉ dẫn rẽ) và **bật cảnh báo quá tốc độ**
   (chữ + giọng nói) + chạy nền (foreground service).
4. Bấm **■ Kết thúc**: dừng dẫn đường, **tắt cảnh báo**, tắt chạy nền, xoá tuyến.

**Đọc giọng nói chỉ dẫn rẽ** (chỉ khi đang `navigating`, tự tắt khi "Kết thúc"):
- Vừa "Khởi hành": đọc câu đầu tiên của tuyến (vd. "Đi về hướng Bắc").
- Trước mỗi chỗ rẽ: nhắc **xa** ("Sau 500 mét, rẽ trái vào...", 400-1000m tuỳ tốc độ) rồi nhắc **gần**
  ("Rẽ trái vào...", 80-250m tuỳ tốc độ) — mỗi lần chỉ đọc 1 lần cho 1 chỗ rẽ.
- Đến nơi: đọc "Bạn đã đến nơi." (1 lần).
- Lệch tuyến: đọc "Bạn đã đi lệch tuyến, đang tính lại đường." trước khi gọi API tính lại.
- Cảnh báo quá tốc độ và chỉ dẫn rẽ dùng chung 1 bộ đọc (TTS): bên nào đang đọc thì bên kia
  chờ, không cắt lời nhau; lượt bị bỏ lỡ sẽ tự thử lại ở lần cập nhật GPS kế tiếp (≤1s sau).
- Bật/tắt và tinh chỉnh ngưỡng nhắc xa/gần ở `VOICE_GUIDANCE_ENABLED`, `GUIDANCE_*` trong `AppConfig.ts`.

Trước khi bấm "Khởi hành" và sau khi "Kết thúc", app chỉ hiện vị trí/tốc độ — **không** cảnh báo.

**Không gọi API theo từng điểm GPS**: tốc độ giới hạn đã nằm sẵn trong dữ liệu tuyến (`RoutePlan.segments`),
`RouteTracker` chỉ chiếu vị trí GPS lên polyline (tính cục bộ) để biết đang ở đoạn nào rồi so sánh.
Chỉ gọi thêm API khi **lệch tuyến** liên tiếp `OFF_ROUTE_CONSECUTIVE_FIXES` điểm (tính lại đường, kèm tốc độ tuyến mới).

Lưu ý: đoạn đường HERE không có dữ liệu tốc độ → không cảnh báo ở đoạn đó. Tốc độ phụ thuộc
`ROUTING_TRANSPORT_MODE` (mặc định `car`). Chỉ dẫn rẽ dùng `ROUTING_LANG` (thử tiếng Việt, rơi về tiếng Anh).
Các tham số nằm ở `src/config/AppConfig.ts`.

## 5. Chạy giả lập trên emulator (không có GPS thật)

Emulator Android/iOS thường không phát tín hiệu tốc độ/hướng di chuyển thật, nên
app đã có sẵn cơ chế **tự động chuyển sang GPS giả lập** khi không lấy được vị trí
thật (không có quyền, GPS lỗi, hoặc không nhận được vị trí nào sau vài giây) — cấu
hình tại `src/config/AppConfig.ts`:

- `ENABLE_MOCK_LOCATION_FALLBACK`: bật/tắt cơ chế giả lập (mặc định `true`).
- `MOCK_LOCATION_TIMEOUT_MS`: thời gian chờ GPS thật trước khi chuyển sang giả lập
  (mặc định 6 giây).
- `MOCK_LOCATION_ORIGIN`: toạ độ gốc để giả lập vị trí di chuyển quanh đó (mặc định
  trung tâm TP.HCM).

Trước khi khởi hành xe giả lập chạy quanh gốc; **sau khi bấm "Khởi hành" xe giả lập chạy dọc theo tuyến đã tính**
(tốc độ dao động 0-80 km/h) để test cảnh báo + chỉ dẫn rẽ. Khi đang dùng dữ liệu giả lập, overlay trên bản đồ hiện chữ **"● DỮ LIỆU GIẢ LẬP
(TEST)"** để phân biệt với GPS thật. Tốc độ giả lập dao động hình sin 0-80 km/h
(xem `src/services/MockLocationService.ts`), nên bạn sẽ thấy cảnh báo vượt tốc độ
(chữ + giọng nói) tự kích hoạt định kỳ mà không cần di chuyển máy thật.

⚠️ Trước khi build bản phát hành cho người dùng thật, nhớ đặt
`ENABLE_MOCK_LOCATION_FALLBACK = false` trong `AppConfig.ts`, tránh trường hợp máy
thật không lấy được GPS mà app lại "giả vờ" có vị trí.

## 6. Chạy app

```bash
npm run android
# hoặc
npm run ios
```

## Cách hoạt động

- `src/services/LocationService.ts`: dùng `react-native-geolocation-service` để
  `watchPosition` liên tục — lấy toạ độ, tốc độ (m/s → convert km/h), hướng di
  chuyển (heading, độ).
- `src/components/HereMapView.tsx`: dùng **Leaflet** + **HERE Raster Tile API v3**
  trong `WebView` (nhẹ, ổn định hơn HERE Maps JavaScript SDK đầy đủ — không cần
  WebGL, không cần link HERE Native SDK), cập nhật marker vị trí hiện tại mỗi khi
  GPS thay đổi. Xem https://docs.here.com/map-rendering/docs/example-leaflet.
- `src/services/RoutingService.ts`: gọi Routing v8 (tuyến + tốc độ theo span + chỉ dẫn) và Discover (tìm địa điểm).
- `src/services/RouteTracker.ts`: so khớp GPS với tuyến, tra tốc độ giới hạn, phát hiện lệch tuyến/đến nơi — không gọi mạng.
- `src/utils/flexPolyline.ts`: giải mã HERE Flexible Polyline.
- `src/hooks/useNavigation.ts`: máy trạng thái `idle → planning → navigating`; chỉ ở `navigating` mới cảnh báo tốc độ.
- `src/services/GuidanceAnnouncer.ts`: quyết định KHI NÀO đọc chỉ dẫn rẽ (nhắc xa/gần/đến nơi), thuần logic, không đụng TTS.
- `src/components/SpeedInfoOverlay.tsx`: hiển thị tốc độ/toạ độ/hướng + banner đỏ
  "QUÁ TỐC ĐỘ CHO PHÉP" khi vượt.
- `src/services/VoiceAlertService.ts`: đọc cảnh báo bằng `react-native-tts`
  (tiếng Việt, fallback tiếng Anh nếu máy không có giọng vi-VN), giới hạn 1 lần
  đọc / 8 giây để tránh làm phiền.

## Có thể mở rộng thêm

- Cache tốc độ giới hạn theo từng đoạn đường (tránh gọi lại API khi đi lại cùng
  tuyến).
- Chạy theo dõi vị trí ở background (cần thêm `react-native-background-geolocation`
  hoặc Foreground Service, vì `watchPosition` thường bị hệ điều hành tạm dừng khi
  app xuống nền).
- Thêm rung (`Vibration` API) kèm cảnh báo cho tình huống lái xe không nghe được
  giọng nói.

## Build app android (apk)
cd android
.\gradlew.bat clean
.\gradlew.bat assembleRelease
