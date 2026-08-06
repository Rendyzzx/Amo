// Helper baca & tulis file tokens.json di repo GitHub (Contents API).
// Butuh env var:
//   GITHUB_TOKENS_PATH = username/repo/branch/path/ke/tokens.json
//   GITHUB_PAT         = Personal Access Token dengan scope "repo" (READ + WRITE)
//
// Catatan: untuk fitur kelola token lewat bot Telegram, PAT WAJIB punya izin
// write (contents: read and write), bukan cuma read-only.

function parseGhPath() {
  const ghPath = process.env.GITHUB_TOKENS_PATH;
  if (!ghPath) throw new Error('GITHUB_TOKENS_PATH belum diset di Environment Variables.');
  const parts = ghPath.split('/');
  const [owner, repo, branch, ...pathParts] = parts;
  const filePath = pathParts.join('/');
  if (!owner || !repo || !branch || !filePath) {
    throw new Error('Format GITHUB_TOKENS_PATH salah. Contoh: username/repo/branch/tokens.json');
  }
  return { owner, repo, branch, filePath };
}

function ghHeaders() {
  const pat = process.env.GITHUB_PAT;
  if (!pat) throw new Error('GITHUB_PAT belum diset di Environment Variables.');
  return {
    accept: 'application/vnd.github.v3+json',
    'user-agent': 'seller-auth-proxy',
    authorization: `token ${pat}`
  };
}

// Ambil isi tokens.json + sha (sha dibutuhkan untuk update file).
// Kalau file belum ada, balikin daftar token kosong dengan sha = null.
async function getTokensFile() {
  const { owner, repo, branch, filePath } = parseGhPath();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const r = await fetch(apiUrl, { headers: ghHeaders() });

  if (r.status === 404) {
    return { tokens: [], sha: null };
  }
  if (!r.ok) throw new Error('Gagal ambil tokens.json dari GitHub.');

  const data = await r.json();
  const text = Buffer.from(data.content, 'base64').toString('utf-8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { tokens: [] };
  }
  const tokens = Array.isArray(parsed) ? normalizeLegacy(parsed) : (parsed.tokens || []);
  return { tokens, sha: data.sha };
}

// Dukung format lama (array of string) -> ubah ke object berlimit unlimited.
function normalizeLegacy(arr) {
  return arr.map(t => (typeof t === 'string' ? { token: t, limit: -1, used: 0 } : t));
}

// Simpan balik daftar token ke GitHub (commit baru).
async function saveTokensFile(tokens, sha, commitMessage) {
  const { owner, repo, branch, filePath } = parseGhPath();
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  const content = Buffer.from(
    JSON.stringify({ tokens }, null, 2),
    'utf-8'
  ).toString('base64');

  const body = {
    message: commitMessage || 'Update tokens.json',
    content,
    branch
  };
  if (sha) body.sha = sha;

  const r = await fetch(apiUrl, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`Gagal simpan tokens.json ke GitHub: ${errBody}`);
  }
  const data = await r.json();
  return data.content.sha;
}

export { getTokensFile, saveTokensFile };
