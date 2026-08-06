// Webhook bot Telegram untuk kelola token seller (buat, hapus, atur limit),
// kirim peringatan/pengumuman (banner), atur mode maintenance website,
// serta kustomisasi profil bot Telegram (nama, deskripsi, foto profil).
//
// ==== SETUP ====
// 1. Buat bot lewat @BotFather, catat TELEGRAM_BOT_TOKEN.
// 2. Chat bot itu sekali, cari chat ID kamu lewat @userinfobot -> itu ADMIN ID.
// 3. Set Environment Variables di Vercel:
//      TELEGRAM_BOT_TOKEN  = token bot
//      TELEGRAM_ADMIN_IDS  = chat id kamu (boleh lebih dari satu, pisah koma)
//      GITHUB_TOKENS_PATH  = username/repo/branch/tokens.json
//      GITHUB_WARNING_PATH = username/repo/branch/warning.json   (opsional)
//      GITHUB_PAT          = PAT dengan scope repo (READ + WRITE)
// 4. Daftarkan webhook (buka sekali di browser):
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://DOMAIN-KAMU.vercel.app/api/bot
//
// ==== PERINTAH DI TELEGRAM ====
//   /addtoken <TOKEN> <LIMIT|unli>   - Buat token baru.
//   /setlimit <TOKEN> <LIMIT|unli>   - Ubah limit token.
//   /reset <TOKEN>                    - Reset pemakaian token ke 0.
//   /deltoken <TOKEN>                 - Hapus token.
//   /listtoken                        - Lihat semua token.
//
//   -- Maintenance Mode --
//   /maintenance [pesan]              - Aktifkan mode maintenance website.
//   /unmaintenance                    - Matikan mode maintenance (kembali normal).
//
//   -- Banner Peringatan Website --
//   /warn <pesan>                     - Tampilkan banner peringatan (kuning) di website.
//   /danger <pesan>                   - Tampilkan banner bahaya (merah) di website.
//   /info <pesan>                     - Tampilkan banner info (biru) di website.
//   /clearwarn                        - Sembunyikan banner di website.
//   /status                           - Lihat status maintenance & banner yang aktif.
//
//   -- Kustomisasi Profil Bot --
//   /setbotname <nama>                - Ubah nama bot Telegram (setMyName).
//   /setdescription <deskripsi>       - Ubah deskripsi bot Telegram (setMyDescription).
//   /setshortdesc <deskripsi>         - Ubah deskripsi singkat bot Telegram (setMyShortDescription).
//   /setprofile [URL]                 - Ubah foto profil bot (setMyProfilePhoto) via URL atau upload foto.
//
//   /start, /help                     - Lihat daftar perintah.

import { getTokensFile, saveTokensFile, getWarningFile, saveWarningFile } from './_lib/github.js';

// Banner gambar buat mempercantik bot. Bisa diganti ke URL gambar sendiri
// (logo/banner brand kamu) kapan aja, tinggal ubah BANNER_IMAGE_URL.
const BANNER_IMAGE_URL =
  'https://placehold.co/900x420/0f0f1a/f5c518/png?text=Alight+Motion+Premium%0AControl+Panel&font=montserrat';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(200).json({ ok: true });

  const update = req.body || {};
  const message = update.message;
  if (!message) return res.status(200).json({ ok: true });

  const text = (message.text || message.caption || '').trim();
  if (!text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;

  if (!isAdmin(chatId)) {
    await sendMessage(botToken, chatId, `⛔ <b>Akses ditolak</b>\nKamu tidak punya izin untuk mengakses bot ini.`);
    return res.status(200).json({ ok: true });
  }

  const cmd = text.split(/\s+/)[0].toLowerCase();

  try {
    // /start dan /help dikirim dengan gambar banner biar lebih "wah".
    if (cmd === '/start' || cmd === '/help') {
      await sendPhoto(botToken, chatId, BANNER_IMAGE_URL, helpText());
      return res.status(200).json({ ok: true });
    }

    const reply = await handleCommand(text, message, botToken);
    await sendMessage(botToken, chatId, reply);
  } catch (e) {
    await sendMessage(botToken, chatId, `❌ <b>Terjadi kesalahan</b>\n<code>${escapeHtml(e.message)}</code>`);
  }

  return res.status(200).json({ ok: true });
}

function isAdmin(chatId) {
  const raw = process.env.TELEGRAM_ADMIN_IDS || '';
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(String(chatId));
}

async function handleCommand(text, message, botToken) {
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  switch (cmd) {
    // ---- Kelola Token Seller ----
    case '/addtoken': {
      const [token, limitRaw] = args;
      if (!token) return '📝 Format:\n<code>/addtoken TOKEN LIMIT</code>\n\nContoh: <code>/addtoken SELLER01 50</code>';
      const limit = parseLimit(limitRaw);

      const { tokens, sha } = await getTokensFile();
      if (tokens.some(t => t.token === token)) {
        return `⚠️ Token <code>${token}</code> sudah ada.\nPakai /setlimit kalau mau ubah limitnya.`;
      }
      tokens.push({ token, limit, used: 0 });
      await saveTokensFile(tokens, sha, `Tambah token ${token}`);
      return (
        `✅ <b>Token Berhasil Dibuat</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `🔑 Token   : <code>${token}</code>\n` +
        `📊 Limit   : ${formatLimit(limit)}\n` +
        `━━━━━━━━━━━━━━`
      );
    }

    case '/setlimit': {
      const [token, limitRaw] = args;
      if (!token || limitRaw === undefined) return '📝 Format:\n<code>/setlimit TOKEN LIMIT</code>';
      const limit = parseLimit(limitRaw);

      const { tokens, sha } = await getTokensFile();
      const entry = tokens.find(t => t.token === token);
      if (!entry) return `⚠️ Token <code>${token}</code> tidak ditemukan.`;
      entry.limit = limit;
      await saveTokensFile(tokens, sha, `Ubah limit token ${token}`);
      return `✅ Limit token <code>${token}</code> diubah jadi <b>${formatLimit(limit)}</b>.`;
    }

    case '/reset': {
      const [token] = args;
      if (!token) return '📝 Format:\n<code>/reset TOKEN</code>';

      const { tokens, sha } = await getTokensFile();
      const entry = tokens.find(t => t.token === token);
      if (!entry) return `⚠️ Token <code>${token}</code> tidak ditemukan.`;
      entry.used = 0;
      await saveTokensFile(tokens, sha, `Reset pemakaian token ${token}`);
      return `🔄 Pemakaian token <code>${token}</code> direset ke <b>0</b>.`;
    }

    case '/deltoken': {
      const [token] = args;
      if (!token) return '📝 Format:\n<code>/deltoken TOKEN</code>';

      const { tokens, sha } = await getTokensFile();
      const idx = tokens.findIndex(t => t.token === token);
      if (idx === -1) return `⚠️ Token <code>${token}</code> tidak ditemukan.`;
      tokens.splice(idx, 1);
      await saveTokensFile(tokens, sha, `Hapus token ${token}`);
      return `🗑️ Token <code>${token}</code> berhasil dihapus.`;
    }

    case '/listtoken': {
      const { tokens } = await getTokensFile();
      if (tokens.length === 0) return '📋 Belum ada token yang terdaftar.';
      const lines = tokens.map(t => {
        const bar = usageBar(t.used || 0, t.limit ?? -1);
        return `🔑 <code>${t.token}</code>\n   ${bar}  ${t.used || 0}/${formatLimit(t.limit ?? -1)}`;
      });
      return `📋 <b>Daftar Token</b> (${tokens.length})\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`;
    }

    // ---- Fitur Maintenance Mode ----
    case '/maintenance': {
      const customMsg = args.join(' ').trim();
      const { warning, sha } = await getWarningFile();

      const maintMsg = customMsg || warning.maintenanceMessage || 'Website sedang dalam pemeliharaan (maintenance). Silakan kembali lagi nanti.';
      warning.maintenance = true;
      warning.maintenanceMessage = maintMsg;
      warning.updatedAt = new Date().toISOString();

      await saveWarningFile(warning, sha, `Aktifkan maintenance mode: ${maintMsg}`);

      return (
        `🛠️ <b>Mode Maintenance DIAKTIFKAN</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `Pesan : ${escapeHtml(maintMsg)}\n` +
        `━━━━━━━━━━━━━━\n` +
        `Pengunjung website akan melihat layar maintenance.`
      );
    }

    case '/unmaintenance': {
      const { warning, sha } = await getWarningFile();
      warning.maintenance = false;
      warning.updatedAt = new Date().toISOString();

      await saveWarningFile(warning, sha, 'Matikan maintenance mode');

      return (
        `✅ <b>Mode Maintenance DIMATIKAN</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `Website telah kembali beroperasi dengan normal.`
      );
    }

    // ---- Fitur banner peringatan di website ----
    case '/warn':
    case '/danger':
    case '/info': {
      const msg = args.join(' ').trim();
      if (!msg) return `📝 Format:\n<code>${cmd} pesan peringatan kamu</code>`;

      const type = cmd === '/warn' ? 'warning' : cmd === '/danger' ? 'danger' : 'info';
      const { warning, sha } = await getWarningFile();
      warning.active = true;
      warning.type = type;
      warning.message = msg;
      warning.updatedAt = new Date().toISOString();

      await saveWarningFile(warning, sha, `Set banner (${type}): ${msg}`);

      const label = type === 'warning' ? '⚠️ Warning' : type === 'danger' ? '🚨 Danger' : 'ℹ️ Info';
      return (
        `📢 <b>Banner Website Diaktifkan</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `Tipe    : ${label}\n` +
        `Pesan   : ${escapeHtml(msg)}\n` +
        `━━━━━━━━━━━━━━\n` +
        `Banner akan muncul di halaman website dalam beberapa detik.`
      );
    }

    case '/clearwarn': {
      const { warning, sha } = await getWarningFile();
      warning.active = false;
      warning.type = 'info';
      warning.message = '';
      warning.updatedAt = new Date().toISOString();

      await saveWarningFile(warning, sha, 'Clear banner website');
      return '✅ Banner di website sudah disembunyikan.';
    }

    case '/status': {
      const { warning } = await getWarningFile();

      const isMaint = !!warning.maintenance;
      const maintStatus = isMaint
        ? `🛠️ <b>AKTIF</b>\n   Pesan: ${escapeHtml(warning.maintenanceMessage || 'Sedang Maintenance')}`
        : `✅ <b>NON-AKTIF</b>`;

      let bannerStatus = '✅ Tidak ada banner yang aktif saat ini.';
      if (warning.active && warning.message) {
        const label = warning.type === 'warning' ? '⚠️ Warning' : warning.type === 'danger' ? '🚨 Danger' : 'ℹ️ Info';
        bannerStatus = `📢 <b>Banner Aktif (${label}):</b>\n   Pesan: ${escapeHtml(warning.message)}`;
      }

      return (
        `📊 <b>Status Website Saat Ini</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `<b>Mode Maintenance:</b>\n${maintStatus}\n\n` +
        `<b>Banner Website:</b>\n${bannerStatus}\n` +
        `━━━━━━━━━━━━━━\n` +
        `Diubah: ${warning.updatedAt || '-'}`
      );
    }

    // ---- Fitur Kustomisasi Profil Bot Telegram ----
    case '/setbotname':
    case '/setname': {
      const name = args.join(' ').trim();
      if (!name) return '📝 Format:\n<code>/setbotname Nama Baru Bot</code>';
      await setBotName(botToken, name);
      return `✅ Nama bot berhasil diubah menjadi: <b>${escapeHtml(name)}</b>`;
    }

    case '/setdescription':
    case '/setdesc': {
      const desc = args.join(' ').trim();
      if (!desc) return '📝 Format:\n<code>/setdescription Deskripsi lengkap bot...</code>';
      await setBotDescription(botToken, desc);
      return `✅ Deskripsi bot berhasil diperbarui.`;
    }

    case '/setshortdesc': {
      const shortDesc = args.join(' ').trim();
      if (!shortDesc) return '📝 Format:\n<code>/setshortdesc Deskripsi singkat bot...</code>';
      await setBotShortDescription(botToken, shortDesc);
      return `✅ Deskripsi singkat bot berhasil diperbarui.`;
    }

    case '/setprofile':
    case '/setphoto': {
      const photoUrlArg = args[0] ? args[0].trim() : null;
      return await setBotProfilePhoto(botToken, message, photoUrlArg);
    }

    default:
      return '❓ Perintah tidak dikenal. Ketik /help untuk lihat daftar perintah.';
  }
}

// Helper Telegram Bot API untuk kustomisasi profil bot
async function setBotName(botToken, name) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyName`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API Error: ${data.description || 'Gagal mengubah nama bot'}`);
}

async function setBotDescription(botToken, description) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyDescription`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API Error: ${data.description || 'Gagal mengubah deskripsi bot'}`);
}

async function setBotShortDescription(botToken, short_description) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setMyShortDescription`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ short_description })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API Error: ${data.description || 'Gagal mengubah deskripsi singkat bot'}`);
}

async function setBotProfilePhoto(botToken, message, photoUrlArg) {
  // Option 1: Admin mengunggah gambar langsung di chat Telegram
  if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
    const largestPhoto = message.photo[message.photo.length - 1];
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      throw new Error(`Gagal mengambil file foto dari Telegram: ${fileData.description || 'Unknown error'}`);
    }

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const imgRes = await fetch(downloadUrl);
    if (!imgRes.ok) throw new Error('Gagal mengunduh foto dari server Telegram.');
    const arrayBuffer = await imgRes.arrayBuffer();

    const formData = new FormData();
    const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
    formData.append('photo', blob, 'profile.jpg');

    const uploadRes = await fetch(`https://api.telegram.org/bot${botToken}/setMyProfilePhoto`, {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadData.ok) {
      throw new Error(`Gagal memperbarui foto profil: ${uploadData.description || 'Unknown error'}`);
    }
    return `🖼️ <b>Foto profil bot berhasil diperbarui</b> dari gambar yang kamu kirim!`;
  }

  // Option 2: Admin memberikan URL gambar
  if (photoUrlArg) {
    if (!photoUrlArg.startsWith('http://') && !photoUrlArg.startsWith('https://')) {
      return '⚠️ URL gambar harus diawali dengan http:// atau https://';
    }
    const imgRes = await fetch(photoUrlArg);
    if (!imgRes.ok) throw new Error(`Gagal mengunduh gambar dari URL: ${imgRes.statusText}`);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imgRes.arrayBuffer();

    const formData = new FormData();
    const blob = new Blob([arrayBuffer], { type: contentType });
    formData.append('photo', blob, 'profile.jpg');

    const uploadRes = await fetch(`https://api.telegram.org/bot${botToken}/setMyProfilePhoto`, {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadData.ok) {
      throw new Error(`Gagal memperbarui foto profil: ${uploadData.description || 'Unknown error'}`);
    }
    return `🖼️ <b>Foto profil bot berhasil diperbarui</b> dari URL!`;
  }

  // Option 3: Tidak ada gambar/URL yang diberikan
  return (
    `📝 <b>Cara Mengubah Foto Profil Bot:</b>\n\n` +
    `1. Kirim/upload foto di chat Telegram dengan caption <code>/setprofile</code> atau <code>/setphoto</code>\n` +
    `2. Atau ketik perintah dengan URL gambar:\n` +
    `<code>/setprofile https://domain.com/foto.jpg</code>`
  );
}

function usageBar(used, limit) {
  if (limit === -1) return '♾️';
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 1;
  const filled = Math.round(ratio * 8);
  return '▓'.repeat(filled) + '░'.repeat(8 - filled);
}

function parseLimit(raw) {
  if (!raw || raw.toLowerCase() === 'unli' || raw.toLowerCase() === 'unlimited') return -1;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) throw new Error('Limit harus angka positif atau "unli".');
  return n;
}

function formatLimit(limit) {
  return limit === -1 ? 'Unlimited ♾️' : String(limit);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function helpText() {
  return (
    `✨ <b>ALIGHT MOTION PREMIUM — BOT ADMIN</b> ✨\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>🔑 Kelola Token Seller</b>\n` +
    `/addtoken TOKEN LIMIT — buat token baru\n` +
    `/setlimit TOKEN LIMIT — ubah limit token\n` +
    `/reset TOKEN — reset jumlah pemakaian\n` +
    `/deltoken TOKEN — hapus token\n` +
    `/listtoken — lihat semua token\n\n` +
    `<b>🛠️ Mode Maintenance Website</b>\n` +
    `/maintenance [pesan] — aktifkan mode maintenance\n` +
    `/unmaintenance — matikan mode maintenance\n\n` +
    `<b>📢 Banner Website</b>\n` +
    `/warn pesan — banner kuning (peringatan)\n` +
    `/danger pesan — banner merah (bahaya)\n` +
    `/info pesan — banner biru (info)\n` +
    `/clearwarn — sembunyikan banner\n` +
    `/status — lihat status maintenance & banner\n\n` +
    `<b>🤖 Pengaturan Profil Bot</b>\n` +
    `/setbotname nama — ubah nama bot\n` +
    `/setdescription deskripsi — ubah deskripsi bot\n` +
    `/setshortdesc deskripsi — ubah deskripsi singkat bot\n` +
    `/setprofile [URL] — ubah foto profil bot (bisa dengan upload foto)\n\n` +
    `<i>Contoh: /maintenance Server sedang perbaikan</i>\n` +
    `<i>Contoh: /setbotname Alight Motion Bot</i>`
  );
}

async function sendMessage(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}

async function sendPhoto(botToken, chatId, photoUrl, caption) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' })
  });
}
