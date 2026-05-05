# Deploy Mail-count trên Railway

Ứng dụng là **một Node service**: build `dist/` + `web/dist`, chạy `npm start` (Express phục vụ API + SPA).

## Chuẩn bị trong Railway Dashboard

### 1. Repo & service

- Kết nối GitHub repo `mailcount` (hoặc deploy CLI).
- **Root directory**: để trống / repo root (cùng cấp với `package.json`).

### 2. Biến môi trường (Variables)

Đặt **đủ SMTP** (và IMAP nếu khác mặc định). Railway inject vào process — khuyến nghị **không** dựa vào file `.env` trên host (filesystem có thể mất khi redeploy).

| Biến | Ý |
|------|---|
| `SMTP_HOST` | VD `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | Email |
| `SMTP_PASS` | App password |
| `IMAP_HOST` | VD `outlook.office365.com` |
| `IMAP_PORT` | `993` |
| `IMAP_TLS` | `true` |
| `SEND_DELAY_MS` | VD `3500` (tuỳ chọn) |

`PORT` Railway tự gán — **đừng** đặt trùng tay.

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
