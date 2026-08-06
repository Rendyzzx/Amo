// Proxy server-side untuk endpoint aktivasi premium.
// Domain & path upstream aslinya TIDAK dikirim ke client — hanya lewat sini.

import { notifyTelegram } from './_lib/telegram.js';

const BASE = 'https://alightmotion.qsr.web.id';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { action, email, link } = req.query;

  try {
    if (action === 'check') {
      if (!email) return res.status(400).json({ success: false, error: 'email wajib diisi' });
      const upstreamRes = await fetch(`${BASE}/api/email-prem?email=${encodeURIComponent(email)}`);
      const data = await upstreamRes.json();

      await notifyTelegram(req, {
        action: 'Cek Status Premium',
        detail: { Email: email, Hasil: JSON.stringify(data) }
      });

      return res.status(200).json(data);

    } else if (action === 'verify') {
      if (!email || !link) return res.status(400).json({ success: false, error: 'email dan link wajib diisi' });
      const upstreamRes = await fetch(`${BASE}/api/vertif-prem?email=${encodeURIComponent(email)}&link=${encodeURIComponent(link)}`);
      const data = await upstreamRes.json();

      await notifyTelegram(req, {
        action: 'Verifikasi Aktivasi Premium',
        detail: { Email: email, Link: link, Hasil: JSON.stringify(data) }
      });

      return res.status(200).json(data);

    } else {
      return res.status(400).json({ success: false, error: 'action tidak valid' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Gagal menghubungi server aktivasi.' });
  }
}
