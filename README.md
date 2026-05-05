# Mail-count — gửi khảo sát qua SMTP, thu phản hồi qua IMAP

Công cụ CLI và **giao diện web**: gửi **từng mail riêng** cho danh sách CSV (có **đính kèm**), log `Message-ID` + mã khảo sát; định kỳ **`poll`** inbox qua **IMAP** để lưu **phản hồi và file đính kèm**; **`export`** báo cáo CSV để đánh giá đã có trả lời hay chưa.

Microsoft 365 thường cấu hình như sau:

- **SMTP gửi:** `smtp.office365.com`, cổng `587`, `STARTTLS`.
- **IMAP đọc:** `outlook.office365.com`, cổng `993`, TLS.

Tổ chức phải cho phép **SMTP AUTH** / **Authenticated SMTP** và **IMAP** cho mailbox (tenant có thể tắt basic auth — khi đó chỉ SMTP/IMAP không còn được, cần Graph). Nếu bật MFA, dùng **app password** hoặc cấu hình theo chính sách tenant.

## Cài đặt

```bash
cd /Users/macos/Desktop/Tikme/Mail-count
npm install
cp .env.example .env
# Tuỳ chọn: CLI cần .env — trên web có thể chỉ nhập email + mật khẩu (preset M365 trong code)

# Đặt file cần gửi kèm vào data/attachments/
```

## Giao diện web

Chạy **API + Vite** (`http://localhost:5173` — proxy `/api` về API local):

```bash
npm run dev:ui
```

- **Bước 1:** chỉ **email công việc + mật khẩu** (Microsoft 365) — máy chủ SMTP/IMAP đã cấu hình sẵn trong code.
- **Bước 2:** nhập tay **email + tên + xưng hô** từng người, hoặc tải **CSV** (cột `email`, tuỳ chọn `greeting`).
- **Gửi & thu:** tiêu đề, nội dung, đính kèm, gửi mail, **kiểm tra hộp thư**, bảng đã gửi / phản hồi, tải báo cáo CSV.
- Tab **Số liệu:** tỷ lệ phản hồi, biểu đồ 14 ngày, cách ghép mail (message-id / subject-code / …).

Production (một cổng — API + asset tĩnh, trên máy anh):

```bash
npm run build
NODE_ENV=production npm start
```

(Trên **Railway**: Nixpacks chạy `npm run build` và `npm start` — xem [`docs/RAILWAY.md`](docs/RAILWAY.md).)

Dev local API mặc định **`127.0.0.1`** + cổng `UI_PORT` hoặc `3781`. Khi có biến **`PORT`** (Railway), server lắng nghe **`0.0.0.0`**.

Khung **Setup tài khoản** và **Lưu CSV danh sách** nằm phía trên trang; cấu hình ghi vào file **`.env`** trên máy (không đồng bộ cloud).

## Deploy Railway

Chi tiết biến môi trường và CLI: [`docs/RAILWAY.md`](docs/RAILWAY.md).

## Đẩy lên GitHub

Xem hướng dẫn từng bước: [`docs/GITHUB.md`](docs/GITHUB.md).

## Chuẩn bị

- **`data/recipients.csv`:** cột bắt buộc `email`; thêm `name`, `survey_code` (tùy — thiếu thì tool tự sinh mã).
- **Cá nhân hóa xưng hô:** cột `greeting` (hoặc `salutation`, `xung_ho`, `loi_chao`, `chao`) — mỗi dòng một cách gọi, ví dụ `Anh Minh`, `Chị Lan`. Trong tiêu đề và nội dung (text/HTML) dùng placeholder `{{greeting}}` hoặc `{{greetingOrName}}` (ưu tiên greeting, không có thì lấy `name`). Có thêm `{{name}}`, `{{email}}`, `{{code}}`. Xem `data/recipients.example.csv` và `data/body.example.txt`.
- **`data/attachments/`:** mọi file trong thư mục sẽ đính kèm **mỗi** mail gửi đi.
- **Nội dung mail:** file text (và tùy chọn HTML).

Tiêu đề gửi đi sẽ **tự thêm** `[CODE: <mã>]` nếu chưa có — để ghép phản hồi khi header `In-Reply-To` thiếu.

## Lệnh

```bash
# Gửi (thử 3 người đầu)
npm run send -- --csv ./data/recipients.csv --subject-template "Khảo sát hợp tác [{{code}}]" --text ./data/body.example.txt --limit 3

# Gửi đủ — bỏ --limit; có thể chỉnh SEND_DELAY_MS trong .env

# Đọc phản hồi (IMAP, mặc định mail từ 7 ngày gần đây)
npm run poll --

# Từ ngày cụ thể
npm run poll -- --since 2026-05-01

# Xuất báo cáo
npm run export -- --out ./data/report.csv
```

## File sinh ra

| File / thư mục | Ý nghĩa |
|----------------|---------|
| `data/outbound-log.jsonl` | Mỗi dòng: người nhận, `surveyCode`, `messageId`, `subject`, thời điểm gửi |
| `data/replies-index.jsonl` | Phản hồi đã import; cách ghép (`message-id` / `subject-code` / `manual-unknown`) |
| `data/replies/<mã hoặc unknown…>/` | `body.txt`, `body.html`, file đính kèm phản hồi |
| `data/report.csv` | Báo cáo tổng hợp theo danh sách đã gửi |

## Build

```bash
npm run typecheck
npm run build           # backend dist/ + web/dist/
npm run build:web       # chỉ Vite UI
npm run build:all       # alias của npm run build
npm start               # production (sau npm run build)
```
