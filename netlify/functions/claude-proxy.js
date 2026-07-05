// Netlify serverless function: proxies requests to the Anthropic API.
//
// Why this exists: RankUp's AI features (personalized answers, AI-scored
// practice feedback, PDS/WES reading) call the Claude API from the browser.
// Inside Claude.ai's artifact runtime, that works because Claude injects the
// necessary auth for you. Once you deploy this app on your own domain
// (Netlify, GitHub Pages, etc.), a public browser CANNOT call
// api.anthropic.com directly — there's no key, and Anthropic's API doesn't
// allow browser-to-API calls with a bare key exposed in client code anyway.
//
// This function sits between your app and Anthropic: your app calls
// "/.netlify/functions/claude-proxy" (same shape as the real API), Netlify
// runs this function server-side using your secret API key (stored as an
// environment variable, never shipped to the browser), and forwards the
// response back.
//
// SETUP:
// 1. Get an API key from https://console.anthropic.com/settings/keys
// 2. In Netlify: Site settings -> Environment variables -> add
//      ANTHROPIC_API_KEY = sk-ant-...your-key...
// 3. In rankup-app.jsx, change:
//      const CLAUDE_API_ENDPOINT = "https://api.anthropic.com/v1/messages";
//    to:
//      const CLAUDE_API_ENDPOINT = "/.netlify/functions/claude-proxy";
// 4. Deploy. That's it — this file is picked up automatically because it
//    lives in netlify/functions/.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server is missing ANTHROPIC_API_KEY. Add it in Netlify: Site settings -> Environment variables.",
      }),
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: event.body,
    });

    const data = await response.text();
    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Could not reach Anthropic API: " + err.message }),
    };
  }
};
