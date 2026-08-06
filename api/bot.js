// Webhook bot Telegram untuk kelola token seller (buat, hapus, atur limit)
// dan kirim peringatan/pengumuman yang muncul sebagai banner di website.
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
//   /warn <pesan>                     - Tampilkan banner peringatan (kuning) di website.
//   /danger <pesan>                   - Tampilkan banner bahaya (merah) di website.
//   /info <pesan>                     - Tampilkan banner info (biru) di website.
//   /clearwarn                        - Sembunyikan banner di website.
//   /status                           - Lihat banner yang sedang aktif.
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
  if (!message || !message.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim();

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

    const reply = await handleCommand(text);
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

async function handleCommand(text) {
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  switch (cmd) {
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

    // ---- Fitur banner peringatan di website ----
    case '/warn':
    case '/danger':
    case '/info': {
      const msg = args.join(' ').trim();
      if (!msg) return `📝 Format:\n<code>${cmd} pesan peringatan kamu</code>`;

      const type = cmd === '/warn' ? 'warning' : cmd === '/danger' ? 'danger' : 'info';
      const { sha } = await getWarningFile();
      const warning = { active: true, type, message: msg, updatedAt: new Date().toISOString() };
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
      const { sha } = await getWarningFile();
      const warning = { active: false, type: 'info', message: '', updatedAt: new Date().toISOString() };
      await saveWarningFile(warning, sha, 'Clear banner website');
      return '✅ Banner di website sudah disembunyikan.';
    }

    case '/status': {
      const { warning } = await getWarningFile();
      if (!warning.active || !warning.message) return '✅ Tidak ada banner yang aktif saat ini.';
      const label = warning.type === 'warning' ? '⚠️ Warning' : warning.type === 'danger' ? '🚨 Danger' : 'ℹ️ Info';
      return (
        `📢 <b>Banner Aktif Saat Ini</b>\n` +
        `━━━━━━━━━━━━━━\n` +
        `Tipe  : ${label}\n` +
        `Pesan : ${escapeHtml(warning.message)}\n` +
        `Diubah: ${warning.updatedAt || '-'}`
      );
    }

    default:
      return '❓ Perintah tidak dikenal. Ketik /help untuk lihat daftar perintah.';
  }
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
    `<b>📢 Banner Website</b>\n` +
    `/warn pesan — banner kuning (peringatan)\n` +
    `/danger pesan — banner merah (bahaya)\n` +
    `/info pesan — banner biru (info)\n` +
    `/clearwarn — sembunyikan banner\n` +
    `/status — lihat banner yang aktif\n\n` +
    `<i>Contoh: /addtoken SELLER01 50</i>\n` +
    `<i>Contoh: /warn Server sedang maintenance</i>`
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
