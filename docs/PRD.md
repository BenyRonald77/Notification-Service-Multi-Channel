# PRD — Notification Service Multi-Channel

| | |
|---|---|
| **Produk** | Notification Service Multi-Channel |
| **Versi** | 1.0 |
| **Tanggal** | 25 September 2026 |
| **Pemilik Produk** | BenyRonald77 |

---

## 1. Tujuan

Studi kasus **system design** untuk layanan notifikasi terpusat: satu API
untuk mengirim notifikasi lewat **email, WhatsApp, dan push notification**,
diproses lewat **antrean BullMQ (Redis)** agar pengiriman tidak memblokir
API caller, dengan **retry otomatis (exponential backoff)**, **dead letter
queue** untuk kegagalan permanen, **template pesan** yang bisa dipakai
ulang, dan **dashboard status pengiriman**.

## 2. Fitur MVP

1. **Satu API pengiriman** (`POST /api/notifications`) menerima channel (email/whatsapp/push), penerima, dan konten (langsung atau lewat template + variabel), lalu memasukkannya ke antrean — tidak menunggu pengiriman selesai.
2. **Worker terpisah** (proses BullMQ Worker) memproses antrean, memanggil "pengirim" sesuai channel (disimulasikan — tanpa provider sungguhan, fokus pada mekanisme antreannya).
3. **Retry otomatis dengan exponential backoff** — pengiriman gagal dicoba ulang otomatis (delay makin lama tiap percobaan) sampai batas maksimum percobaan.
4. **Dead Letter Queue (DLQ)** — notifikasi yang tetap gagal setelah seluruh percobaan habis dipindah ke antrean terpisah agar tidak hilang & bisa ditinjau/di-retry manual.
5. **Template pesan** — admin membuat template per channel dengan placeholder `{{variabel}}`, dipakai ulang saat mengirim tanpa menulis ulang isi pesan.
6. **Dashboard status pengiriman** — daftar notifikasi beserta status (antre/diproses/terkirim/gagal/dead-letter), jumlah percobaan, pesan error terakhir; termasuk tampilan khusus DLQ dengan tombol kirim ulang manual.

## 3. Kebutuhan Fungsional

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-1 | API pengiriman langsung mengembalikan respons setelah job masuk antrean, tidak menunggu pengiriman selesai (asinkron) | Must |
| FR-2 | Worker mencoba ulang job yang gagal dengan delay meningkat (exponential backoff), bukan retry langsung tanpa jeda | Must |
| FR-3 | Setelah percobaan maksimum habis, job dipindah ke Dead Letter Queue dan status notifikasi di database jadi `DEAD_LETTER`, bukan hilang begitu saja | Must |
| FR-4 | Notifikasi di DLQ bisa dikirim ulang manual dari dashboard (reset percobaan, masuk antrean lagi) | Must |
| FR-5 | Template pesan mendukung placeholder `{{variabel}}` yang diganti dengan nilai yang dikirim saat request | Must |
| FR-6 | Dashboard menampilkan status realtime-cukup (polling) dari setiap notifikasi: channel, penerima, status, jumlah percobaan, error terakhir | Should |

## 4. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| **Keandalan** | Job yang gagal tidak pernah hilang diam-diam — selalu berakhir di `SENT` atau `DEAD_LETTER` yang tercatat di database |
| **Skalabilitas** | Worker berjalan sebagai proses terpisah dari API, bisa dijalankan sebagai banyak instance/concurrency untuk menambah throughput tanpa mengubah API |
| **Observability** | Setiap transisi status notifikasi (termasuk pesan error) tercatat di database untuk keperluan debugging/dashboard |

## 5. Arsitektur Teknis

```
POST /api/notifications ──▶ simpan Notification (status QUEUED)
                             ──▶ BullMQ Queue "notifications" (Redis)
                                                    │
                                    Worker (proses terpisah) ambil job
                                                    │
                                     ┌──── sukses ───┴──── gagal ────┐
                                     ▼                                ▼
                          status = SENT                  percobaan < maksimum?
                                                          ├─ ya  → retry (backoff)
                                                          └─ tidak → status = DEAD_LETTER
                                                                     + masuk Queue "notifications-dlq"
```

- Next.js (TypeScript) untuk API & dashboard; **worker BullMQ berjalan sebagai proses Node.js terpisah** (`npm run worker`) — arsitektur ini sengaja memisahkan API layer (menerima & mencatat permintaan) dari worker layer (memproses pengiriman), pola umum layanan notifikasi produksi.
- Database (Prisma/SQLite-PostgreSQL) menyimpan `Notification` (status, percobaan, error) dan `NotificationTemplate`.
- Redis dipakai BullMQ sebagai broker antrean (queue utama + queue DLQ terpisah).
- Channel pengirim (email/whatsapp/push) disimulasikan (mock) — recipient berawalan `fail-` sengaja dibuat selalu gagal untuk keperluan pengujian mekanisme retry/DLQ secara deterministik.

## 6. Kriteria Penerimaan

- [ ] Mengirim notifikasi ke recipient `fail-...@...` menghasilkan beberapa kali percobaan dengan delay yang meningkat (bisa diamati dari log/timestamp), lalu berakhir di status `DEAD_LETTER`.
- [ ] Mengirim notifikasi ke recipient normal berhasil berstatus `SENT` pada percobaan pertama.
- [ ] Notifikasi di DLQ bisa di-retry manual dan berhasil terkirim bila kondisi kegagalannya sudah diperbaiki (mis. dites ulang dengan recipient valid).
- [ ] Template dengan placeholder menghasilkan isi pesan akhir yang benar sesuai variabel yang dikirim.
- [ ] Dashboard menampilkan status yang konsisten dengan data di database untuk setiap notifikasi.

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Worker down, antrean menumpuk tanpa diproses | Job tetap tersimpan aman di Redis sampai worker kembali hidup — tidak ada job yang hilang karena worker mati sementara |
| Retry storm membebani provider pihak ketiga saat terjadi outage masal | Exponential backoff membuat jeda antar percobaan makin lama, mengurangi beban dibanding retry langsung tanpa jeda |
| Notifikasi gagal permanen tidak pernah ditinjau manusia | Dashboard DLQ menampilkan semua notifikasi dead-letter secara eksplisit, bukan tersembunyi di log |
