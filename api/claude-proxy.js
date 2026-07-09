// api/claude-proxy.js
//
// This runs on Vercel's servers, never in the visitor's browser, so it's the
// one place allowed to hold your real Anthropic API key.
//
// SETUP (one time):
//   1. Make sure this file lives at api/claude-proxy.js in your project root
//      (Vercel auto-detects anything under /api as a serverless function —
//      no vercel.json or extra config needed).
//   2. In the Vercel dashboard: your project -> Settings -> Environment
//      Variables -> Add: key = ANTHROPIC_API_KEY, value = your key from
//      https://console.anthropic.com/settings/keys. Apply it to
//      Production (and Preview, if you test on preview deploys).
//   3. Redeploy (Vercel picks up new env vars on the next deploy — a plain
//      "Redeploy" from the dashboard is enough).
//
// That's it — App.jsx already points CLAUDE_API_ENDPOINT at
// "/api/claude-proxy", so no further code changes are needed.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel Project settings -> Environment Variables, then redeploy.",
    });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.text();
    res.status(upstream.status).setHeader("Content-Type", "application/json").send(data);
  } catch (err) {
    res.status(502).json({ error: "Could not reach the AI service: " + err.message });
  }
}
