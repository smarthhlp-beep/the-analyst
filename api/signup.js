module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = ((req.body && req.body.email) || '').toString().trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  if (!valid) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  console.log('NEW_SIGNUP:', email, new Date().toISOString());

  const url = process.env.SHEET_WEBHOOK_URL;
  if (url) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ email, secret: process.env.SHEET_SECRET || '' }),
      });
      if (!r.ok) console.error('Sheet webhook failed:', r.status);
    } catch (e) {
      console.error('Sheet webhook error:', e);
    }
  }

  return res.status(200).json({ ok: true });
};
