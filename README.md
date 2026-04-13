# 🚀 IPN Webhook Receiver & Decryptor Dashboard

Một giải pháp toàn diện và giao diện đẹp mắt dùng để hứng, phân tích và tự động giải mã các luồng dữ liệu Webhook (IPN - Instant Payment Notification) theo thời gian thực (Real-time). Được thiết kế tối ưu cho quá trình tích hợp cổng thanh toán trực tuyến (như Xendit, Momo, VNPay...) và xử lý các bản tin mã hoá cực mạnh.

---

## ✨ Tính Năng Nổi Bật

*   **📡 Real-time Webhook Feed:** Dữ liệu webhook lọt vào máy chủ sẽ được bắn ngay lên giao diện Web UI hiển thị tức thì không cần tải lại trang thông qua công nghệ **Server-Sent Events (SSE)**.
*   **🔑 Multi-Key & Auto-Decrypt:** Quản lý không giới hạn số lượng Secret Key (Tên đối tác, Màu sắc hiển thị). Tự động chạy dò đệ quy các key để giải mã payload (Hỗ trợ cả thuật toán `AES-256-GCM` và `AES-256-CBC`).
*   **🗂️ Lọc dữ liệu theo Tab thông minh:** Khi thiết lập nhiều Key, giao diện tự động chia hệ thống Feed ra làm các bộ lọc Tab độc lập. Gói tin trúng Key nào tự chui vào Tab đó, kèm theo **Huy hiệu thông báo đếm số (Badge Unread)** để bạn không bao giờ bỏ sót tin mới. Các tin rác/không khớp sẽ bị cách ly ra "Tab Thất Bại".
*   **🤖 Tích hợp Bot Telegram:** Tuỳ chọn cài đặt Bot Token và nhóm (Chat ID) để phần mềm tự động bắn thẳng giao dịch sau khi giải mã lên ứng dụng Telegram cho hệ thống kế toán hoặc nhân viên theo dõi.
*   **🧑‍💻 URL Session Độc lập:** Ứng dụng mô hình Multi-tenant `clientId`. Khởi tạo các Endpoint Webhook URL **Được cá nhân hóa cho mỗi trình duyệt** để các Lập trình viên trong team không dẫm chân lên nhau khi đang test.
*   **🔫 Trình Mô phỏng (Simulator):** Tích hợp công cụ giả lập sinh nội dung mã hóa và bắn lên chính Webhook của bạn để Test hệ thống một cách trơn tru trước khi ráp vào code thật.
*   **🛡️ Giao diện Glassmorphism đỉnh cao:** Thiết kế UI/UX hiện đại, Dark-mode sang trọng, mang lại cảm giác cực "cuốn" trong suốt quá trình ngồi chờ và test Webhook.

---

## 🛠️ Yêu Cầu Hệ Thống

Để chạy được dự án này, máy tính hoặc Server của bạn cần cài đặt:
- **Node.js** (Phiên bản v14.0.0 trở lên)
- **NPM** (Node Package Manager)

---

## 🚀 Cài Đặt và Chạy

**Bước 1:** Tải bộ mã nguồn (Clone) về ổ đĩa của bạn và mở thư mục trong Terminal/CMD.

**Bước 2:** Cài đặt các thư viện cần thiết.
```bash
npm install
# Hoặc nếu chưa có file package.json thì hãy chạy: npm install express
```

**Bước 3:** Khởi động máy chủ Webhook.
```bash
npm start
# Hoặc bạn có thể chạy trực tiếp: node server.js
```
*Lưu ý: Mặc định server sẽ chạy ở port **3000**.*

**Bước 4:** Mở trình duyệt và truy cập vào Dashboard tại:
👉 `http://localhost:3000`

---

## 🌐 Publish ra Internet cho Đối Tác bằng Ngrok
Khi cổng thanh toán yêu cầu phải là một Link HTTPS public để họ trả IPN về, bạn có thể nhanh chóng dùng `ngrok` để public mạng ở môi trường Local.

Mở thêm 1 cửa sổ CMD mới (vẫn giữ phần mềm Node kia đang chạy) và gõ lệnh:
```bash
ngrok http 3000
```
Ngrok sẽ cung cấp cho bạn một đường Link có dạnh `https://xxxxxx.ngrok.app`. Lúc này, bạn chép link đó rồi cộng thêm nhánh Endpoint Webhook cá nhân của bạn (Lấy ở dòng sáng nhất trên Website Dashboard).

Ví dụ bạn gửi cho cổng thanh toán là: **`https://abcd-efgh.ngrok.app/webhook/ipn/9c24b17f...`**

---

## 🔒 Cấu Hình Secret Key & Giải Mã
1. Trên giao diện Web, bấm **+ Thêm Cấu Hình**.
2. Điền **Tên Đại diện**, Chọn **Màu Sắc** để dán Tag.
3. Nhập **Secret Key** chuẩn xác bằng mã HEX hoặc dạng Text Plain (Dài đúng 32 bytes / 32 Ký tự / 64 HEX).
4. Nhấn **Lưu Toàn Bộ Key**. 

Kể từ lúc này, mọi dữ kiện mã hóa gửi vào Endpoint của bạn sẽ bị "nhào lặn" và bẻ khoá tự động, sắp xếp vào Tab hiển thị Raw JSON.

---

## 👨‍💻 Cấu trúc thư mục (File Structure)
- `/server.js` - Chứa toàn bộ Backend Core, mã hoá, tạo lập session in-memory và điều phối WebSocket (SSE).
- `/public/index.html` - Trang HTML định hình bộ khung UI của Dashboard.
- `/public/style.css` - Bảng quy tắc thiết kế mang âm hưởng "Hacker/Cyberpunk Glassmorphism".
- `/public/script.js` - Logic Frontend điều khiển hiển thị Tab, liên kết Simulator, điều khiển form.

---
**Chúc bạn Coding ngon giấc và Test IPN mượt mà!** 🍵
