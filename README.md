# RankUp – AO & ADAS Reviewer — Standalone Deployment Kit

This folder turns the Claude-artifact version of RankUp into a real, standalone
website you can host on your own domain via GitHub + Netlify, with real
Google Sign-In and working AI features.

## What's inside
```
├── index.html              entry HTML
├── src/
│   ├── main.jsx             mounts the app
│   └── App.jsx              the full RankUp app (same one from Claude)
├── netlify/functions/
│   └── claude-proxy.js      keeps your Anthropic API key secret server-side
├── netlify.toml             tells Netlify how to build/host this
└── package.json
```

## Why you need this (and can't just upload the .jsx file)
Two things only work inside Claude.ai's own runtime and need real
replacements once you're on your own domain:
1. **AI calls** (`fetch("https://api.anthropic.com/...")`) — a public browser
   can't call Anthropic directly with a secret key. `claude-proxy.js` fixes
   this: your app calls your own Netlify function, which calls Anthropic
   using a key that stays server-side.
2. **Storage** (`window.storage`) — this is a Claude-only API. `App.jsx`
   already includes a fallback that automatically uses the browser's
   `localStorage` instead when `window.storage` doesn't exist, so progress,
   profile info, and practice history still save — just per-device, not
   synced across devices. (For cross-device sync, swap this for Firebase or
   Supabase later — a bigger step, not required to go live.)

Google Sign-In needs **no code changes** for this step — it works the same
on any real domain once configured (see Step 1 below).

---

## Step 1 — Get a Google OAuth Client ID (5 minutes)
1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project (or pick an existing one).
3. Click **Create Credentials → OAuth client ID**.
4. If prompted, configure the **OAuth consent screen** first (External, app
   name "RankUp", your email, save).
5. Application type: **Web application**.
6. Under **Authorized JavaScript origins**, add the URL you'll deploy to —
   you'll know this after Step 3 (Netlify gives you a `*.netlify.app` URL
   immediately, or your custom domain). You can add it now with a guess
   (e.g. `https://rankup-reviewer.netlify.app`) and edit it later if the
   name differs — Netlify lets you rename the site before or after deploy.
7. Copy the generated **Client ID** (ends in `.apps.googleusercontent.com`).
8. Open `src/App.jsx`, find this line near the top, and paste your ID:
   ```js
   const GOOGLE_CLIENT_ID = "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
   ```

## Step 2 — Get an Anthropic API key
1. Go to https://console.anthropic.com/settings/keys
2. Create a key (you'll need a payment method on file — this app's AI
   features make real API calls, which have a small per-request cost).
3. Keep this key handy for Step 4 — never put it directly in `App.jsx`.

## Step 3 — Push this folder to GitHub
```bash
cd netlify-deploy-kit
git init
git add .
git commit -m "RankUp reviewer app"
gh repo create rankup-reviewer --public --source=. --push
# (or create a repo manually on github.com and follow its "push an existing
#  repository" instructions)
```

## Step 4 — Deploy on Netlify
1. Go to https://app.netlify.com → **Add new site → Import an existing project**.
2. Connect your GitHub account and pick the repo you just pushed.
3. Build settings should auto-fill from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Before deploying, go to **Site settings → Environment variables** and add:
   - `ANTHROPIC_API_KEY` = the key from Step 2
5. Click **Deploy site**. Netlify gives you a live URL like
   `https://your-site-name.netlify.app`.
6. Go back to Google Cloud Console (Step 1) and make sure that exact URL is
   listed under **Authorized JavaScript origins** for your OAuth client.
   Save.
7. (Optional) Under **Domain settings** in Netlify, rename the site or add
   your own custom domain.

## Step 5 — Test it
Open your live URL. You should see:
- A working **Sign in with Google** button (real account, real name/photo)
- Reviewer, Interview Practice, Profile, Settings all functional
- AI-scored practice answers and PDS/WES reading working (via your Netlify
  function + Anthropic key)
- Progress saved in the browser (refresh the page — it should still be there)

## Local testing before you deploy
```bash
npm install
npm run dev
```
Note: AI features won't work in `npm run dev` unless you also run
`netlify dev` (via the Netlify CLI: `npm i -g netlify-cli && netlify dev`),
since the proxy function only runs inside Netlify's environment (or its
local emulator).

## Costs
- Netlify: free tier is enough for this app.
- Google OAuth: free.
- Anthropic API: pay-as-you-go, billed per request — costs scale with how
  much your users use AI scoring/personalization. Set a spending limit in
  the Anthropic console if you want a hard ceiling.
