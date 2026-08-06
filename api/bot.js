// Webhook bot Telegram untuk kelola token seller: buat token baru, atur/ubah
// limit pemakaian, lihat daftar, hapus, reset pemakaian. Setiap perubahan
// langsung di-commit ke tokens.json di GitHub.
//
// ==== SETUP ====
// 1. Buat bot lewat @BotFather, catat TELEGRAM_BOT_TOKEN.
// 2. Chat bot itu sekali, buka https://api.telegram.org/bot<TOKEN>/getUpdates
//    untuk lihat "chat":{"id": ...} -> itu ADMIN_CHAT_ID kamu.
// 3. Set Environment Variables di Vercel:
//      TELEGRAM_BOT_TOKEN = token bot
//      TELEGRAM_ADMIN_IDS = chat id kamu (boleh lebih dari satu, pisah koma)
//      GITHUB_TOKENS_PATH = username/repo/branch/tokens.json
//      GITHUB_PAT         = PAT dengan scope repo (READ + WRITE)
// 4. Setelah deploy, daftarkan webhook (buka sekali di browser / curl):
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://DOMAIN-KAMU.vercel.app/api/bot
//
// ==== PERINTAH DI TELEGRAM ====
//   /addtoken <TOKEN> <LIMIT|unli>   - Buat token baru. LIMIT = jumlah pemakaian, atau "unli" untuk tanpa batas.
//   /setlimit <TOKEN> <LIMIT|unli>  - Ubah limit token yang sudah ada.
//   /reset <TOKEN>                  - Reset jumlah pemakaian token ke 0.
//   /deltoken <TOKEN>                - Hapus token.
//   /listtoken                       - Lihat semua token beserta limit & pemakaian.
//   /help                            - Lihat daftar perintah.

import { getTokensFile, saveTokensFile } from './_lib/github.js';

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
    await sendMessage(botToken, chatId, '⛔ Kamu tidak punya akses ke bot ini.');
    return res.status(200).json({ ok: true });
  }

  try {
    const reply = await handleCommand(text);
    await sendMessage(botToken, chatId, reply);
  } catch (e) {
    await sendMessage(botToken, chatId, `❌ Error: ${e.message}`);
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
    case '/start':
    case '/help':
      return helpText();

    case '/addtoken': {
      const [token, limitRaw] = args;
      if (!token) return 'Format: /addtoken <TOKEN> <LIMIT|unli>';
      const limit = parseLimit(limitRaw);

      const { tokens, sha } = await getTokensFile();
      if (tokens.some(t => t.token === token)) {
        return `⚠️ Token "${token}" sudah ada. Pakai /setlimit kalau mau ubah limitnya.`;
      }
      tokens.push({ token, limit, used: 0 });
      await saveTokensFile(tokens, sha, `Tambah token ${token}`);
      return `✅ Token dibuat:\n<code>${token}</code>\nLimit: ${formatLimit(limit)}`;
    }

    case '/setlimit': {
      const [token, limitRaw] = args;
      if (!token || limitRaw === undefined) return 'Format: /setlimit <TOKEN> <LIMIT|unli>';
      const limit = parseLimit(limitRaw);

      const { tokens, sha } = await getTokensFile();
      const entry = tokens.find(t => t.token === token);
      if (!entry) return `⚠️ Token "${token}" tidak ditemukan.`;
      entry.limit = limit;
      await saveTokensFile(tokens, sha, `Ubah limit token ${token}`);
      return `✅ Limit token <code>${token}</code> diubah jadi: ${formatLimit(limit)}`;
    }

    case '/reset': {
      const [token] = args;
      if (!token) return 'Format: /reset <TOKEN>';

      const { tokens, sha } = await getTokensFile();
      const entry = tokens.find(t => t.token === token);
      if (!entry) return `⚠️ Token "${token}" tidak ditemukan.`;
      entry.used = 0;
      await saveTokensFile(tokens, sha, `Reset pemakaian token ${token}`);
      return `✅ Pemakaian token <code>${token}</code> direset ke 0.`;
    }

    case '/deltoken': {
      const [token] = args;
      if (!token) return 'Format: /deltoken <TOKEN>';

      const { tokens, sha } = await getTokensFile();
      const idx = tokens.findIndex(t => t.token === token);
      if (idx === -1) return `⚠️ Token "${token}" tidak ditemukan.`;
      tokens.splice(idx, 1);
      await saveTokensFile(tokens, sha, `Hapus token ${token}`);
      return `🗑️ Token <code>${token}</code> dihapus.`;
    }

    case '/listtoken': {
      const { tokens } = await getTokensFile();
      if (tokens.length === 0) return 'Belum ada token.';
      const lines = tokens.map(t =>
        `• <code>${t.token}</code> — ${t.used || 0}/${formatLimit(t.limit)}`
      );
      return `📋 Daftar token (${tokens.length}):\n${lines.join('\n')}`;
    }

    default:
      return 'Perintah tidak dikenal. Ketik /help untuk lihat daftar perintah.';
  }
}

function parseLimit(raw) {
  if (!raw || raw.toLowerCase() === 'unli' || raw.toLowerCase() === 'unlimited') return -1;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0) throw new Error('Limit harus angka positif atau "unli".');
  return n;
}

function formatLimit(limit) {
  return limit === -1 ? 'Unlimited' : String(limit);
}

function helpText() {
  return (
    '🤖 <b>Perintah Kelola Token</b>\n\n' +
    '/addtoken TOKEN LIMIT — buat token baru (LIMIT angka atau "unli")\n' +
    '/setlimit TOKEN LIMIT — ubah limit token\n' +
    '/reset TOKEN — reset jumlah pemakaian ke 0\n' +
    '/deltoken TOKEN — hapus token\n' +
    '/listtoken — lihat semua token'
  );
}

async function sendMessage(botToken, chatId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
}
