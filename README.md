# Alight Motion Premium — Frontend + Backend (Vercel)

## Struktur folder

```
.
├── index.html          ← Frontend (UI). Hanya memanggil endpoint /api/... miliknya sendiri.
├── api/
│   ├── tempail.js       ← Proxy ke tempail.top (buat email, list pesan, baca pesan)
│   ├── tempbox.js        ← Proxy ke tempmail.lol (server fallback)
│   └── premium.js        ← Proxy ke API aktivasi premium (cek status & verifikasi)
├── package.json
└── vercel.json
```

## Kenapa ini lebih aman dibanding file HTML tunggal sebelumnya

Sebelumnya semua endpoint upstream (tempail.top, tempmail.lol, dan domain aktivasi
premium) beserta header spoofing-nya ditulis langsung di JavaScript sisi client —
artinya siapa pun yang buka DevTools → Network/Sources, atau sekadar
"View Page Source" / scrape halaman, bisa melihat persis endpoint apa yang dipanggil.

Sekarang, `index.html` hanya memanggil endpoint miliknya sendiri:
`/api/tempail`, `/api/tempbox`, `/api/premium`. Endpoint upstream yang sebenarnya
hanya ada di kode di dalam folder `api/` — kode ini **berjalan di server Vercel**,
tidak pernah dikirim ke browser. Kalau seseorang scrape/copy `index.html` saja
(tanpa folder `api/`), fitur cek email & aktivasi otomatis tidak akan berfungsi,
karena endpoint `/api/...` itu tidak ada di server mereka.

## Cara deploy ke Vercel

1. Install Vercel CLI (kalau belum ada):
   ```
   npm i -g vercel
   ```
2. Masuk ke folder project ini lewat terminal, lalu jalankan:
   ```
   vercel
   ```
   Ikuti instruksinya (login akun Vercel, pilih nama project, dsb).
3. Untuk deploy ke production:
   ```
   vercel --prod
   ```

Atau lewat dashboard vercel.com: upload/drag folder ini (atau hubungkan lewat GitHub
repo), Vercel akan otomatis mendeteksi folder `api/` sebagai Serverless Functions
tanpa konfigurasi tambahan.

## Fitur Login Seller (khusus tab Pribadi & Generate)

Tab **Pribadi** dan **Generate** sekarang dikunci token — tab **Buyer Mail** tetap
bebas diakses. Daftar token valid **tidak ditulis di kode**, tapi diambil dari
sebuah file JSON di GitHub lewat endpoint `/api/auth.js`.

### 1. Siapkan file token di GitHub

Buat file (misal `tokens.json`) di repo GitHub kamu, isinya:
```json
["TOKEN-SELLER-1", "TOKEN-SELLER-2"]
```
atau
```json
{ "tokens": ["TOKEN-SELLER-1", "TOKEN-SELLER-2"] }
```

### 2. Atur Environment Variable di Vercel

Buka Project di Vercel → **Settings → Environment Variables**, isi salah satu opsi:

**Opsi A — Repo GitHub PUBLIK (paling simpel, tanpa PAT):**
| Key | Value |
|---|---|
| `TOKENS_RAW_URL` | `https://raw.githubusercontent.com/USERNAME/REPO/BRANCH/tokens.json` |

**Opsi B — Repo GitHub PRIVATE (butuh GitHub PAT):**
| Key | Value |
|---|---|
| `GITHUB_TOKENS_PATH` | `USERNAME/REPO/BRANCH/tokens.json` |
| `GITHUB_PAT` | Personal Access Token dari GitHub (scope `repo` → read) |

Cara bikin PAT: GitHub → foto profil → **Settings → Developer settings →
Personal access tokens → Fine-grained tokens** → buat token baru dengan akses
read-only ke repo yang berisi `tokens.json` itu saja.

Setelah env var diisi, redeploy project (`vercel --prod` lagi, atau tinggal
klik **Redeploy** di dashboard) supaya perubahan env var kepakai.

### Alur di frontend
1. User klik tab **Pribadi** / **Generate** → muncul popup **Login Seller**.
2. Masukkan token → dicek ke `/api/auth?token=...` → backend cocokkan ke daftar
   token dari GitHub.
3. Kalau cocok, tab kebuka dan status "sudah login" disimpan di `sessionStorage`
   browser (jadi gak perlu login ulang tiap pindah tab selama tab browser masih
   sama; hilang otomatis kalau tab/browser ditutup).
4. Tab **Buyer Mail** tidak butuh login sama sekali.



- **Rate limiting**: saat ini endpoint `/api/*` bisa dipanggil siapa saja yang tahu
  URL-nya (tidak ada autentikasi). Kalau mau dibatasi hanya dari domain sendiri,
  bisa tambahkan pengecekan `req.headers.referer` / `origin` di setiap handler,
  atau pasang Vercel Firewall / rate limiting dari dashboard.
- **Environment variable**: kalau nanti endpoint upstream butuh API key rahasia,
  simpan di Vercel → Project Settings → Environment Variables (jangan hardcode di
  kode), lalu akses lewat `process.env.NAMA_VARIABEL` di file `api/*.js`.
