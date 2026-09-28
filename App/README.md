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

⚠️ **Về API tốc độ cho phép**: `src/services/SpeedLimitService.ts` dùng
**HERE Map Attributes API v8**:

```
GET https://smap.hereapi.com/v8/maps/attributes
    ?layers=SPEED_LIMITS_FC1,SPEED_LIMITS_FC2,SPEED_LIMITS_FC3,SPEED_LIMITS_FC4,SPEED_LIMITS_FC5
    &in=proximity:<lat>,<lon>;r=50
    &apiKey=YOUR_HERE_API_KEY
```

- `SPEED_LIMITS_FCn` chỉ là tên mẫu: n = functional class (1-5) nên phải liệt kê
  từng layer thật. Có thể bớt layer để tiết kiệm quota.
- Response dạng `geometries[].attributes` (`FROM_REF_SPEED_LIMIT`,
  `TO_REF_SPEED_LIMIT`, `SPEED_LIMIT_UNIT` = K/M). App chọn đoạn đường gần vị trí
  GPS nhất và quy đổi về km/h.
- Cân nhắc layer `APPLICABLE_SPEED_LIMIT` (đã gộp giới hạn có điều kiện/giờ/loại
  xe): https://docs.here.com/map-attributes/docs/applicablespeedlimit

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

Khi đang dùng dữ liệu giả lập, overlay trên bản đồ hiện chữ **"● DỮ LIỆU GIẢ LẬP
(TEST)"** để phân biệt với GPS thật. Tốc độ giả lập dao động hình sin 0-80 km/h
(xem `src/services/MockLocationService.ts`), nên bạn sẽ thấy cảnh báo vượt tốc độ
(chữ + giọng nói) tự kích hoạt định kỳ mà không cần di chuyển máy thật.

⚠️ Trước khi build bản phát hành cho người dùng thật, nhớ đặt
`ENABLE_MOCK_LOCATION_FALLBACK = false` trong `AppConfig.ts`, tránh trường hợp máy
thật không lấy được GPS mà app lại "giả vờ" có vị trí.

## Patch trực tiếp thư viện, fix lỗi khi build
 *** Error: A problem occurred evaluating project ':react-native-tts'. > Could not find method jcenter() for arguments [] on repository container of type org.gradle.api.internal.artifacts.dsl.DefaultRepositoryHandler.
- Mở file bị lỗi: node_modules/react-native-tts/android/build.gradle trong project
- Thay jcenter() bằng mavenCentral() (Tìm tất cả dòng có chữ jcenter() đổi thành mavenCentral(). Nếu một block đã có sẵn mavenCentral() rồi thì chỉ cần xóa dòng jcenter() thừa.)

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
- `src/hooks/useSpeedGuard.ts`: logic chính —
  - Khi tốc độ > 50 km/h **và** thay đổi ≥ 5 km/h so với lần kiểm tra gần nhất
    (và cách lần gọi trước tối thiểu 5s, chống spam API) → gọi
    `fetchSpeedLimit()`.
  - Nếu tốc độ hiện tại > tốc độ cho phép trả về → gọi cảnh báo giọng nói.
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
