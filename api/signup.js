module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = ((req.body && req.body.email) || '').toString().trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  if (!valid) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // For now, signups are stored in Vercel's Logs tab.
  console.log('NEW_SIGNUP:', email, new Date().toISOString());

  return res.status(200).json({ ok: true });
};
