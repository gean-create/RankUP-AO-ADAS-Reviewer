// api/claude-proxy.js
//
// This runs on Vercel's servers, never in the visitor's browser, so it's the
// one place allowed to hold your API key.
//
// This proxy talks to Google's Gemini API, which has a genuinely free tier
// (no credit card required, unlike Anthropic's API). It accepts requests in
// the same shape App.jsx already sends (an Anthropic-style body), translates
// them to Gemini's format behind the scenes, and translates the response
// back — so App.jsx itself needed no changes.
//
// SETUP (one time, free):
//   1. Go to https://aistudio.google.com/apikey and sign in with any Google
//      account. Click "Create API key". No credit card, no billing needed.
//   2. In the Vercel dashboard: your project -> Settings -> Environment
//      Variables -> Add: key = GEMINI_API_KEY, value = the key you just
//      copied. Apply it to Production (and Preview, if you test there too).
//   3. Redeploy (Vercel picks up new env vars on the next deploy — a plain
//      "Redeploy" from the dashboard is enough).
//
// Free tier limits (subject to Google changing them): roughly 10-15
// requests/minute and 250-1000+ requests/day on the Flash models used here —
// comfortably enough for a personal review app used by one or a few people.
// If you ever outgrow it, add billing on the same Google Cloud project and
// nothing else here needs to change.

// Google renames/retires free-tier models more often than you'd like. Try
// these in order — first one that actually answers wins. If Google shuffles
// the lineup again, add the new model name to the front of this list rather
// than replacing it, so older keys/projects still fall through to one that
// works for them.
const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];

function anthropicContentToGeminiParts(content) {
  // App.jsx sends either a plain string, or (for file uploads) an array of
  // Anthropic-style content blocks: {type:"text", text} / {type:"image",
  // source:{media_type, data}} / {type:"document", source:{media_type, data}}.
  if (typeof content === "string") {
    return [{ text: content }];
  }
  if (!Array.isArray(content)) return [{ text: String(content || "") }];

  return content.map((block) => {
    if (block.type === "text") {
      return { text: block.text || "" };
    }
    if ((block.type === "image" || block.type === "document") && block.source && block.source.data) {
      return {
        inline_data: {
          mime_type: block.source.media_type || "application/octet-stream",
          data: block.source.data,
        },
      };
    }
    return { text: "" };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey, add it in Vercel Project settings -> Environment Variables, then redeploy.",
    });
    return;
  }

  try {
    const body = req.body || {};
    const maxTokens = body.max_tokens || 1000;
    const systemText = body.system || "";
    const firstMessage = (body.messages && body.messages[0]) || {};
    const parts = anthropicContentToGeminiParts(firstMessage.content);

    const geminiBody = {
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemText) {
      geminiBody.system_instruction = { parts: [{ text: systemText }] };
    }

    let parsed = null;
    let lastError = null;
    let lastStatus = 502;

    for (const model of GEMINI_MODELS) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model + ":generateContent?key=" + apiKey;

      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      const raw = await upstream.text();
      let parsedBody;
      try { parsedBody = JSON.parse(raw); } catch (e) { parsedBody = null; }

      if (upstream.ok && parsedBody) {
        parsed = parsedBody;
        break; // this model worked — stop trying the rest
      }

      lastStatus = upstream.status;
      lastError = (parsedBody && parsedBody.error && parsedBody.error.message) || ("Gemini API error (status " + upstream.status + ")");

      // Only keep falling through the list for "this model doesn't exist /
      // isn't available to you" style errors. Anything else (bad key,
      // content blocked, quota) is the same for every model, so stop and
      // report it immediately instead of burning through the whole list.
      const isModelIssue = upstream.status === 404 || /no longer available|not found|not supported/i.test(lastError);
      if (!isModelIssue) break;
    }

    if (!parsed) {
      res.status(lastStatus).json({ error: lastError || "All AI models are currently unavailable." });
      return;
    }

    const candidate = parsed.candidates && parsed.candidates[0];
    const finishReason = candidate && candidate.finishReason;
    const textParts = (candidate && candidate.content && candidate.content.parts) || [];
    const text = textParts.map((p) => p.text || "").join("").trim();

    if (!text) {
      const reasonNote = finishReason ? (" (finishReason: " + finishReason + ")") : "";
      res.status(502).json({ error: "Gemini returned an empty response" + reasonNote + "." });
      return;
    }

    // Re-shape into the Anthropic Messages format App.jsx already expects,
    // so no client-side parsing changes are needed.
    res.status(200).json({ content: [{ type: "text", text }] });
  } catch (err) {
    res.status(502).json({ error: "Could not reach the AI service: " + err.message });
  }
}
