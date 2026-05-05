# Đẩy Mail-count lên GitHub

## Trước khi commit

- **Không commit** `.env` (đã có trong `.gitignore`).
- **Không commit** `data/campaign-recipients.csv` (danh sách riêng của anh — đã ignore).
- Chỉ commit **trong thư mục dự án Mail-count**, không `git init` nhầm ở thư mục `$HOME`.

## Tạo repo trên GitHub

1. GitHub → **New repository** (vd. `mail-count`).
2. Bỏ README nếu trong máy đã có README sẵn để tránh conflict.

## Lệnh (một lần)

```bash
cd /Users/macos/Desktop/Tikme/Mail-count

git init
git branch -M main
git add .
git status   # không thấy .env / node_modules / campaign-recipients.csv
git commit -m "feat: Mail-count — SMTP/IMAP tool + web UI setup"
git remote add origin git@github.com:<USER>/<REPO>.git
git push -u origin main
```

HTTPS origin (nếu cần):

`https://github.com/<USER>/<REPO>.git`

## Clone máy khác

```bash
git clone git@github.com:<USER>/<REPO>.git
cd <REPO>
npm install
cp .env.example .env
npm run dev:ui
```
