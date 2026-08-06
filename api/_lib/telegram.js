// Helper kirim notifikasi ke Telegram lewat Bot API.
// Butuh 2 Environment Variable di Vercel:
//   TELEGRAM_BOT_TOKEN = token dari @BotFather (contoh: 123456:ABC-DEF...)
//   TELEGRAM_CHAT_ID   = chat id tujuan (user id kamu, atau id grup/channel)
//
// Cara dapat TELEGRAM_CHAT_ID:
//   1. Chat bot kamu (kirim pesan apa aja ke bot-nya dulu)
//   2. Buka https://api.telegram.org/bot<TOKEN>/getUpdates
//   3. Cari field "chat":{"id": ...}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

async function sendRaw(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch (e) {
    // Jangan sampai kegagalan notif Telegram bikin request utama gagal.
    console.error('Gagal kirim notifikasi Telegram:', e.message);
  }
}

// Notifikasi transaksi/aktivitas normal (bukan error).
async function notifyTelegram(req, { action, detail = {} }) {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '-';
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const detailLines = Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`)
    .join('\n');

  const text =
    `🔔 <b>${escapeHtml(action)}</b>\n` +
    `<b>Waktu:</b> ${escapeHtml(time)} WIB\n` +
    `<b>IP:</b> <code>${escapeHtml(ip)}</code>\n` +
    `<b>User-Agent:</b> ${escapeHtml(ua)}\n` +
    (detailLines ? `\n${detailLines}` : '');

  await sendRaw(text);
}

// Notifikasi khusus error/gagal — isi pesan error asli biar gampang di-debug.
async function notifyError(req, { action, error, extra = {} }) {
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '-';
  const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const errMsg = (error && error.message) ? error.message : String(error);

  const extraLines = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`)
    .join('\n');

  const text =
    `🔴 <b>ERROR: ${escapeHtml(action)}</b>\n` +
    `<b>Waktu:</b> ${escapeHtml(time)} WIB\n` +
    `<b>IP:</b> <code>${escapeHtml(ip)}</code>\n` +
    `<b>User-Agent:</b> ${escapeHtml(ua)}\n` +
    (extraLines ? `${extraLines}\n` : '') +
    `\n<b>Pesan Error:</b>\n<code>${escapeHtml(errMsg)}</code>`;

  await sendRaw(text);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { notifyTelegram, notifyError, getClientIp };
