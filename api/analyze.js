module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  const input = ((req.body && req.body.input) || '').toString().trim().slice(0, 4000);
  if (!input) {
    return res.status(400).json({ error: 'No input provided' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const systemPrompt = `You are THE ANALYST, an educational investment research tool.
The user gives you a news headline, an event, or a ticker. Trace how it connects to publicly traded companies or sectors, estimate the likely impact, and describe what a disciplined investor might consider.

Rules:
- Be specific and honest about uncertainty. Never promise returns.
- Use hedged, ranged estimates (for example "-3% to -8%"), not single numbers.
- confidence must be one of: Low, Medium, High.
- action must be one of: ACCUMULATE, HOLD, REDUCE, EXIT.
- This is educational research, not personalized financial advice.
- Include between 1 and 4 entries in each list.

Respond with ONLY valid JSON in exactly this shape:
{
  "input_summary": "one or two sentences restating the event or ticker",
  "connections": [
    { "entity": "company, sector, or asset", "type": "direct / supplier / competitor / sector / macro", "why": "short explanation of the link" }
  ],
  "impact": [
    { "entity": "...", "direction": "Positive / Negative / Mixed", "range": "estimated move, e.g. +2% to +6%", "confidence": "Low / Medium / High", "short_term": "days to weeks", "medium_term": "months", "long_term": "years" }
  ],
  "action": [
    { "entity": "...", "action": "ACCUMULATE / HOLD / REDUCE / EXIT", "reasoning": "why a disciplined investor might consider this", "projected_exposure": "suggested position-size thinking, e.g. keep any single position under 5% of portfolio" }
  ]
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', response.status, errText);
      return res.status(502).json({ error: 'The AI service returned an error.' });
    }

    const data = await response.json();
    let text =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map((p) => p.text || '').join('')) ||
      '';

    text = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
};
