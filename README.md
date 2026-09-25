# Notification Service Multi-Channel

Satu API untuk mengirim notifikasi lewat **email**, **WhatsApp**, dan **push**,
diproses lewat antrean [BullMQ](https://docs.bullmq.io/) (Redis) dengan retry
eksponensial otomatis, dead letter queue (DLQ), template pesan, dan dashboard
status pengiriman.

## Arsitektur

```
Client / integrasi pihak ketiga
        │  POST /api/notifications  (X-Api-Key atau session)
        ▼
  Next.js API Route ──► DB: Notification (status=QUEUED)
        │
        ▼
  BullMQ Queue "notifications" (Redis)
        │
        ▼
  Worker process (worker/index.ts, proses terpisah dari Next.js)
        │
        ├─ sukses ─► status=SENT
        │
        └─ gagal ──► retry dengan backoff eksponensial (1s, 2s, 4s, 8s, ...)
                     │
                     └─ percobaan terakhir gagal
                              │
                              ▼
                     status=DEAD_LETTER + job dikirim ke
                     Queue "notifications-dlq"
```

- **API** (`src/app/api/notifications/route.ts`) hanya bertugas membuat baris
  `Notification` di database dan menambahkan job ke antrean BullMQ. API tidak
  pernah mengirim notifikasi secara langsung/sinkron.
- **Worker** (`worker/index.ts`) adalah proses Node.js terpisah yang
  menjalankan `npm run worker` / `npm run worker:start`. Ia mengambil job dari
  antrean, memanggil "sender" per channel (`src/lib/channels/*.ts`), lalu
  memperbarui status di database.
- Setiap perubahan status dicatat sebagai `NotificationEvent` sehingga riwayat
  percobaan pengiriman bisa dilihat.
- Retry memakai fitur bawaan BullMQ: `attempts` (default 5, diatur lewat
  `NOTIFICATION_MAX_ATTEMPTS`) dan `backoff: { type: "exponential", delay: 1000 }`.
- Saat percobaan terakhir tetap gagal (`job.attemptsMade >= job.opts.attempts`),
  worker menandai notifikasi sebagai `DEAD_LETTER` dan menambahkan job baru ke
  antrean `notifications-dlq` supaya kegagalan permanen mudah dipantau/diproses
  terpisah dari antrean utama.
- Dashboard menyediakan tombol **Retry** untuk notifikasi berstatus
  `FAILED`/`DEAD_LETTER`, yang mereset percobaan dan memasukkannya lagi ke
  antrean utama.

## Kenapa channel & status disimpan sebagai `String`, bukan `enum` Prisma?

Proyek ini memakai SQLite untuk lingkungan development (lihat catatan di
bawah), dan SQLite **tidak mendukung enum native** pada Prisma. Channel
(`EMAIL`/`WHATSAPP`/`PUSH`) dan status notifikasi karena itu disimpan sebagai
`String` di skema, namun tetap divalidasi secara ketat lewat union type
TypeScript di `src/lib/types.ts` (`CHANNELS`, `NOTIFICATION_STATUSES`) dan
divalidasi ulang dengan Zod di setiap API route. Pada deployment produksi
dengan PostgreSQL, kolom ini bisa diubah menjadi `enum` Prisma asli bila
diinginkan.

## Template pesan

Template disimpan di tabel `NotificationTemplate` dengan `key` unik.
Placeholder ditulis dengan sintaks `{{namaVariabel}}` dan diganti saat
notifikasi diantrekan (`renderTemplate` di `src/lib/notification-service.ts`):

```json
POST /api/notifications
{
  "channel": "WHATSAPP",
  "recipient": "628123456789",
  "templateKey": "otp-whatsapp",
  "variables": { "otp": "445566" }
}
```

## Verifikasi retry & dead letter queue (hasil nyata)

Karena tidak ada kredensial email/WhatsApp/push sungguhan di lingkungan
development, tiga "sender" (`src/lib/channels/*.ts`) memakai implementasi
mock yang **secara deterministik gagal** bila nomor/alamat penerima diawali
`fail-`. Ini dipakai untuk menguji jalur retry dan DLQ dengan kegagalan
nyata (bukan asumsi), lewat proses worker sungguhan yang berjalan terpisah:

```
[worker] Percobaan 1 gagal untuk notifikasi cmuh677s..., akan dicoba lagi
[worker] Percobaan 2 gagal untuk notifikasi cmuh677s..., akan dicoba lagi
[worker] Percobaan 3 gagal untuk notifikasi cmuh677s..., akan dicoba lagi
[worker] Percobaan 4 gagal untuk notifikasi cmuh677s..., akan dicoba lagi
[worker] Notifikasi cmuh677s... masuk Dead Letter Queue: Gagal mengirim WhatsApp ke fail-user (simulasi kegagalan)
```

Setelah masuk `DEAD_LETTER`, notifikasi berhasil diproses ulang lewat
`POST /api/notifications/:id/retry` dan worker kembali memproses job dari
percobaan pertama. Notifikasi dengan penerima normal (tanpa prefix `fail-`)
diverifikasi berhasil `SENT` dalam satu kali percobaan.

## Menjalankan secara lokal

```bash
cp .env.example .env
npm install

# Redis wajib berjalan (dipakai BullMQ)
redis-server --daemonize yes

npx prisma db push
npm run prisma:seed   # membuat user demo + 2 template contoh

npm run dev            # Next.js di http://localhost:3000
npm run worker          # proses worker terpisah, WAJIB berjalan agar notifikasi terkirim
```

Akun demo setelah seed: `demo@notif.dev` / `password123`. API key demo
ditampilkan di terminal setelah seed dijalankan, dan juga bisa dilihat di
halaman **Dashboard** setelah login.

### Catatan konkurensi SQLite

`DATABASE_URL` di `.env.example` memakai
`?connection_limit=1&socket_timeout=20` karena SQLite hanya mendukung satu
penulis (*single-writer lock*) dalam satu waktu. Pengaturan ini mencegah
`PrismaClientKnownRequestError: Operations timed out` ketika API dan worker
mengakses database secara bersamaan. Untuk produksi, disarankan memakai
PostgreSQL yang mendukung locking per-baris dan concurrency yang jauh lebih
baik.

## Environment variables

| Variabel | Keterangan |
| --- | --- |
| `DATABASE_URL` | Koneksi SQLite (dev) / PostgreSQL (produksi) |
| `JWT_SECRET` | Secret untuk menandatangani session cookie |
| `REDIS_URL` | Koneksi Redis untuk BullMQ |
| `NOTIFICATION_MAX_ATTEMPTS` | Jumlah percobaan maksimum sebelum masuk DLQ (default 5) |

## API ringkas

- `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me`
- `POST /api/notifications` — kirim notifikasi baru (autentikasi via
  `X-Api-Key` atau session login)
- `GET /api/notifications?status=DEAD_LETTER` — daftar notifikasi milik user
- `POST /api/notifications/:id/retry` — kirim ulang notifikasi yang gagal
- `GET /api/templates`, `POST /api/templates` — kelola template pesan

## Struktur proyek

```
src/
  app/
    api/            API routes (auth, notifications, templates)
    dashboard/       Dashboard status pengiriman + manajemen template
    login, register  Halaman autentikasi
  lib/
    channels/        Mock sender email/WhatsApp/push
    auth.ts           Autentikasi session + API key
    notification-service.ts   Enqueue notifikasi + render template
    queue.ts          Definisi BullMQ Queue (utama & DLQ)
    redis-connection.ts
    types.ts          Union type Channel & NotificationStatus
worker/
  index.ts            Proses worker BullMQ (jalankan terpisah dari Next.js)
prisma/
  schema.prisma
  seed.ts
```
