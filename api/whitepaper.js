const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODELS = [
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const SYSTEM_PROMPT = `You are THE ANALYST, an educational research tool that reviews company white papers for risk.
You are given a company or project white paper. Assess how risky it appears to be based ONLY on what the document says and does not say.

Rules:
- Never invent facts. If the document lacks information, say so and treat the gap as a risk factor.
- Look for: vague or unproven claims, unrealistic promises or guaranteed returns, missing financials or revenue model, unclear or anonymous team, no evidence of a working product, token or equity concentration, unclear use of funds, regulatory or legal exposure, dependence on hype, and plain missing detail.
- risk_score is an integer from 0 (very low risk) to 100 (very high risk).
- risk_level must be one of: Low, Moderate, High, Very High.
- severity must be one of: Low, Medium, High.
- This is an educational assessment from the document alone, not investment advice and not a verified probability.
- Keep each item short and specific. Include 3 to 6 risk_factors, 0 to 5 red_flags, 0 to 4 strengths, and 3 to 5 questions_to_ask.

Respond with ONLY valid JSON in exactly this shape:
{
  "document_summary": "two or three sentences on what the company or project claims to do",
  "risk_score": 0,
  "risk_level": "Low / Moderate / High / Very High",
  "score_rationale": "two or three sentences explaining why this score",
  "risk_factors": [
    { "category": "e.g. Team, Financials, Product, Legal, Market", "severity": "Low / Medium / High", "finding": "what the document shows or lacks" }
  ],
  "red_flags": ["short items"],
  "strengths": ["short items"],
  "questions_to_ask": ["short items an investor should ask the company"]
}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  const body = req.body || {};
  const text = (body.text || '').toString().trim().slice(0, 150000);
  const pdf = (body.pdfBase64 || '').toString();

  if (!text && !pdf) {
    return res.status(400).json({ error: 'No document provided' });
  }
  if (pdf.length > 4200000) {
    return res.status(413).json({ error: 'PDF is too large. Use a file under 3 MB or paste the text.' });
  }

  const parts = pdf
    ? [
        { inlineData: { mimeType: 'application/pdf', data: pdf } },
        { text: 'Assess the attached company white paper.' },
      ]
    : [{ text: 'Assess this company white paper:\n\n' + text }];

  const models = [process.env.GEMINI_MODEL, ...FALLBACK_MODELS].filter(Boolean);
  let lastError = '';

  for (const model of models) {
    try {
      const response = await fetch(`${BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      });

      if (response.status === 404) {
        lastError = `Model not found: ${model}`;
        console.error(lastError);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini error:', model, response.status, errText);
        return res.status(502).json({
          error: 'The AI service returned an error.',
          detail: errText.slice(0, 500),
        });
      }

      const data = await response.json();
      let out =
        (data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts.map((p) => p.text || '').join('')) ||
        '';

      out = out.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(out);
      parsed.risk_score = Math.max(0, Math.min(100, Math.round(Number(parsed.risk_score) || 0)));
      return res.status(200).json(parsed);
    } catch (err) {
      console.error('Whitepaper error:', model, err);
      return res.status(500).json({ error: 'Analysis failed. Please try again.' });
    }
  }

  return res.status(502).json({ error: 'No working model found. ' + lastError });
};
