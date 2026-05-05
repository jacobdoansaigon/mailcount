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

---

## Chế độ nhiều user + magic link + MongoDB

Khi có **`MONGODB_URI`** hoặc **`MONGO_URL`** (Railway Mongo plugin), API chuyển sang đăng nhập magic link, user và danh sách email lưu Mongo; log gửi/phản hồi vẫn nằm dưới `data/` (nên gắn **Volume** nếu cần giữ lâu).

| Biến | Ý |
|------|---|
| `MONGODB_URI` | Chuỗi kết nối Mongo **hoặc** tham chiếu Railway `${{TenServiceMongo.MONGO_URL}}` |
| `MONGO_URL` | App cũng đọc biến này (plugin Mongo trên Railway thường chỉ inject `MONGO_URL`) |
| `JWT_SECRET` | **Bắt buộc** — chuỗi ngẫu nhiên ≥ 16 ký tự (ký phiên cookie) |
| `SMTP_USER` / `SMTP_PASS` | **Bắt buộc** cho multi-user — mail **hệ thống** gửi magic link (không phải mailbox khảo sát từng user) |
| `PUBLIC_APP_URL` | Tuỳ chọn — nếu không set, app dùng `https://${RAILWAY_PUBLIC_DOMAIN}` cho link trong email |

**Lưu ý bảo mật:** lệnh `railway variable list --json` có thể in ra giá trị thật của secret — tránh chạy trong môi trường lộ log; trên dashboard dùng nút **Secret** cho `SMTP_PASS` / `JWT_SECRET`.

### Bước trên Dashboard (khuyến nghị vì `railway add` đôi khi báo Unauthorized)

1. Project → **+ New** → **Database** → **MongoDB**. Đặt tên service cho dễ nhớ (ví dụ **`Mongo`**).
2. Service **mailcount** → **Variables** → thêm **`MONGODB_URI`** = `${{Mongo.MONGO_URL}}` (đổi `Mongo` đúng tên service anh đặt; **không** bọc ngoặc kép trên UI nếu Railway báo lỗi — xem [Using Variables](https://docs.railway.com/guides/variables)).
3. Cùng service **mailcount**: **`JWT_SECRET`** (đã có thể được set sẵn qua CLI), **`SMTP_USER`**, **`SMTP_PASS`**.
4. **Redeploy** mailcount sau khi Mongo đã chạy xanh.

### CLI sau `railway login`

```bash
cd /path/to/Mail-count
railway link   # nếu chưa link project/service

# Sau khi đã có service Mongo (tên mặc định Mongo):
./scripts/railway-multiuser-wire-mongo.sh Mongo

# Hoặc tự set:
railway variable set -s mailcount -e production 'MONGODB_URI=${{Mongo.MONGO_URL}}'

# Nếu `railway add -d mongo` báo Unauthorized: chạy `railway login` lại rồi thử, hoặc tạo Mongo trên dashboard.
```

### Đã thực hiện trên project Railway của anh (qua CLI trong phiên này)

- Đã đặt **`JWT_SECRET`** mới (đã rotate một lần vì lệnh list JSON có thể lộ giá trị cũ trong log — anh coi secret hiện tại là bản dùng chính thức).
- **`MONGODB_URI`** đã **gỡ** tạm thời vì chưa có service Mongo nên tham chiếu resolve rỗng → app vẫn chạy **chế độ một mailbox** (`SMTP_*` như cũ). Khi anh tạo Mongo xong, chạy `./scripts/railway-multiuser-wire-mongo.sh <TênService>` hoặc set biến trên dashboard như trên.

**Anh vẫn cần tự nhập trên Railway:** `SMTP_USER` + `SMTP_PASS` (em không có mật khẩu mailbox của anh). Sau khi gắn Mongo + `MONGODB_URI`, magic link và tài khoản per-user mới hoạt động đầy đủ.
