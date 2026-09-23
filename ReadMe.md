# HereSpeedGuard

Ứng dụng React Native CLI: theo dõi GPS (toạ độ, tốc độ, hướng di chuyển), hiển thị
vị trí trên HERE Map, và cảnh báo (chữ + giọng nói) khi vượt tốc độ cho phép.

Đây là **mã nguồn**, chưa phải project đã chạy `npx react-native init` — cần ghép vào
một project RN CLI thật vì môi trường tạo file này không chạy được `npm`/`react-native`
CLI (build native Android/iOS).

## 1. Tạo project RN CLI và copy source

```bash
npx @react-native-community/cli@latest init HereSpeedGuardApp --version 0.86.0
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

## 3. Khai báo quyền vị trí

- Android: mở `android/app/src/main/AndroidManifest.xml`, thêm nội dung trong
  `android-AndroidManifest-additions.xml` (đặt trước thẻ `<application>`).
- iOS: mở `ios/HereSpeedGuard/Info.plist`, thêm nội dung trong
  `ios-Info-plist-additions.xml`.

`react-native-tts` (Android) cần thêm queue TTS engine mặc định của máy — không cần
cấu hình thêm, nhưng máy ảo (emulator) thường KHÔNG có sẵn giọng đọc, nên test giọng
nói trên máy thật hoặc cài Google Text-to-Speech trên emulator.

## 4. Cấu hình HERE API Key

Mở `src/config/AppConfig.ts`, thay `YOUR_HERE_API_KEY` bằng key thật lấy tại
https://platform.here.com (dùng cho cả HERE Maps JS API hiển thị bản đồ, và API
tra cứu tốc độ cho phép).

⚠️ **Về API tốc độ cho phép**: endpoint `https://hereapi.com?...` trong yêu cầu ban đầu
không phải domain thật của HERE. File `src/services/SpeedLimitService.ts` đã tạm
trỏ tới `https://route.ls.hereapi.com/routing/7.2/getlinkinfo.json` (HERE Routing
API v7 - GetLinkInfo, endpoint hỗ trợ tham số `attributes=SPEED_LIMITS_FCN(*)`) —
đây là suy đoán hợp lý nhất dựa trên tham số bạn đưa, nhưng bạn cần:
1. Đăng nhập HERE Developer Portal, kiểm tra gói dịch vụ của bạn có bật
   Routing API v7 / Fleet Telematics không, và domain endpoint chính xác.
2. Gọi thử 1 lần bằng Postman với toạ độ thật, log `response.data`, rồi đối chiếu
   lại hàm `extractSpeedLimitKmh()` trong `SpeedLimitService.ts` — cấu trúc JSON
   trả về (field chứa tốc độ giới hạn) có thể khác tuỳ version API bạn được cấp.

## 5. Chạy app

```bash
npm run android
# hoặc
npm run ios
```

## Cách hoạt động

- `src/services/LocationService.ts`: dùng `react-native-geolocation-service` để
  `watchPosition` liên tục — lấy toạ độ, tốc độ (m/s → convert km/h), hướng di
  chuyển (heading, độ).
- `src/components/HereMapView.tsx`: nhúng HERE Maps JavaScript API trong `WebView`
  (không cần link HERE Native SDK), cập nhật marker vị trí hiện tại mỗi khi GPS
  thay đổi.
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

## Patch trực tiếp thư viện, fix lỗi khi build
 *** Error: A problem occurred evaluating project ':react-native-tts'. > Could not find method jcenter() for arguments [] on repository container of type org.gradle.api.internal.artifacts.dsl.DefaultRepositoryHandler.
- Mở file bị lỗi: node_modules/react-native-tts/android/build.gradle trong project
- Thay jcenter() bằng mavenCentral() (Tìm tất cả dòng có chữ jcenter() đổi thành mavenCentral(). Nếu một block đã có sẵn mavenCentral() rồi thì chỉ cần xóa dòng jcenter() thừa.

