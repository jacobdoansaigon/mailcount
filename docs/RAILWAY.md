# Deploy Mail-count trên Railway

Ứng dụng là **một Node service**: build `dist/` + `web/dist`, chạy `npm start` (Express phục vụ API + SPA).

## Chuẩn bị trong Railway Dashboard

### 1. Repo & service

- Kết nối GitHub repo `mailcount` (hoặc deploy CLI).
- **Root directory**: để trống / repo root (cùng cấp với `package.json`).

### 2. Biến môi trường (Variables)

**Tối thiểu:** `SMTP_USER` + `SMTP_PASS` (email công việc Microsoft 365 + mật khẩu / mã ứng dụng). Trong code đã **mặc định sẵn** máy chủ Microsoft 365 (SMTP/IMAP); chỉ cần ghi đè nếu dùng nhà cung cấp khác.

| Biến | Ý |
|------|---|
| `SMTP_USER` | **Bắt buộc** trên Railway — email |
| `SMTP_PASS` | **Bắt buộc** — mật khẩu hoặc app password |
| `SMTP_HOST` | Tuỳ chọn — mặc định `smtp.office365.com` |
| `SMTP_PORT` | Tuỳ chọn — `587` |
| `SMTP_SECURE` | Tuỳ chọn — `false` |
| `IMAP_HOST` | Tuỳ chọn — `outlook.office365.com` |
| `IMAP_PORT` | Tuỳ chọn — `993` |
| `IMAP_TLS` | Tuỳ chọn — `true` |
| `SEND_DELAY_MS` | Tuỳ chọn — `3500` |

Railway inject vào process — khuyến nghị **không** phụ thuộc file `.env` trên host (có thể mất khi redeploy). Giao diện web «chỉ email + mật khẩu» ghi file `.env` **trên máy local**; trên PaaS anh dùng Variables như trên.

`PORT` Railway tự gán — **đừng** đặt trùng tay.

**Gửi nhiều mail:** mỗi mail có trễ `SEND_DELAY_MS` (mặc định 3,5s) — request `/api/send` có thể kéo dài **vài phút**. Nếu giao diện bị cắt giữa chừng, kiểm tra **HTTP timeout** trên proxy / edge (Railway có thể giới hạn ~100s) — giải pháp: gửi từng đợt ít người (Tuỳ chọn nâng cao → giới hạn N), hoặc tăng timeout nếu nền tảng cho phép.

Tuỳ chọn ghi đè cổng nội bộ: `LISTEN_HOST=0.0.0.0` (mặc định đã là `0.0.0.0` khi có `PORT`).

### 3. Disk & dữ liệu

`data/` (log outbound, replies, uploads UI) là **filesystem tạm** — sau redeploy có thể mất trừ khi anh gắn **Railway Volume** và trỏ thư mục (vd. mount vào `./data`). Nếu chỉ dùng tool gửi/ngắt hạn có thể chấp nhận không volume.

### 4. Domain

Railway → **Networking → Generate Domain**. Public URL dùng HTTPS; Express log có thể hiện `RAILWAY_PUBLIC_DOMAIN` khi có.

## CLI (đã login)

```bash
cd /path/to/Mail-count

# Gắn thư mục với project + service đã tạo trên dashboard
railway link -p <PROJECT_ID> -s mailcount -e production

# Xem/không chỉnh Variables (tránh lộ secret trong log)
railway variables

# Deploy từ máy (snapshot code local)
railway up --detach
```

Sau khi anh **đã nối GitHub** và bật auto-deploy, mỗi lần push `main` có thể deploy tự động — không cần `railway up`.

## Build / Start (trong repo)

- **Build (Nixpacks mặc định):** `npm run build` (= `tsc` + Vite).
- **Start:** `npm start` → `node dist/server/index.js`, `NODE_ENV=production`.

Healthcheck: `GET /api/health`.

## Troubleshooting

- **502 / không lên**: xem **Deploy logs** — thường thiếu `SMTP_USER` / `SMTP_PASS` hoặc build lỗi.
- **Permission denied mail**: kiểm tra tenant Microsoft (SMTP AUTH / IMAP).
- **SPA trắng**: đảm bảo build có `web/dist/` (script `npm run build`).
