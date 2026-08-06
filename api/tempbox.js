// Proxy server-side untuk tempmail.lol (server fallback "Tempbox").
// Sama seperti tempail.js — endpoint upstream disembunyikan dari client.

import { notifyTelegram } from './_lib/telegram.js';

const HEADERS = { 'user-agent': 'NB Android/1.0.0' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { action, token } = req.query;

  try {
    if (action === 'create') {
      const upstreamRes = await fetch('https://api.tempmail.lol/v2/inbox/create', {
        method: 'POST',
        headers: HEADERS
      });
      const data = await upstreamRes.json();

      await notifyTelegram(req, {
        action: 'Buat Email Temp (Tempbox)',
        detail: { Email: data.address }
      });

      return res.status(200).json({ success: true, email: data.address, emailToken: data.token });

    } else if (action === 'messages') {
      if (!token) return res.status(400).json({ success: false, error: 'token wajib diisi' });
      const upstreamRes = await fetch(`https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(token)}`, {
        headers: HEADERS
      });
      const data = await upstreamRes.json();

      await notifyTelegram(req, {
        action: 'Cek List Pesan (Tempbox)',
        detail: { 'Jumlah Pesan': (data.emails || []).length }
      });

      return res.status(200).json({ success: true, messages: data.emails || [] });

    } else {
      return res.status(400).json({ success: false, error: 'action tidak valid' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Gagal menghubungi server email.' });
  }
}
