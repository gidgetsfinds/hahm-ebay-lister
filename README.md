# Listing Writer 🪄

Turn item photos into ready-to-post eBay listings. Upload a few photos of one
item, and Claude writes the title, description, item specifics, and a suggested
price — the same way the original `ebay_lister` script does, but in a friendly
web page you can open on your Mac **or your phone**.

This is **Phase 1: The Listing Writer**. Phase 2 will add one-click posting
straight to eBay.

---

## What you get

- 📸 Drag-and-drop (or tap-to-add) photo upload
- 🤖 Claude writes a full eBay listing from the photos
- ✍️ Editable title (with the 80-character limit shown) and description
- 📋 One-tap copy for the title and description
- ⬇️ Download the whole listing as a file
- 🔒 Your API key stays on the server — never exposed to the browser

---

## Run it on your own computer (optional)

You only need this if you want to test changes locally. To just *use* it, skip
to **Deploy to the web** below.

1. Install [Node.js](https://nodejs.org/) (the "LTS" version).
2. In a terminal, from this folder:
   ```bash
   npm install
   ```
3. Make a file called `.env.local` with your Anthropic key:
   ```bash
   echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env.local
   ```
4. Start it:
   ```bash
   npm run dev
   ```
5. Open <http://localhost:3000>.

> Get an Anthropic API key at <https://console.anthropic.com/>.

---

## Deploy to the web (so you can bookmark it — no Terminal)

This puts the app online at a private URL you can open from any device. It's
free for personal use.

### Step 1 — Put the code on GitHub

1. Create a free account at <https://github.com> if you don't have one.
2. Make a **new repository** (call it `ebay-lister-web`). Keep it **Private**.
3. Upload this folder to it. The easiest no-Terminal way:
   - On the new repo page, click **uploading an existing file**.
   - Drag in **everything except** the `node_modules` folder and `.env.local`
     (those are excluded automatically by `.gitignore` if you use git, but if
     you're dragging files manually, just don't include them).

   *(If you're comfortable with Terminal: `git init`, `git add .`,
   `git commit -m "Listing Writer"`, then push to your new repo.)*

### Step 2 — Connect to Vercel

1. Create a free account at <https://vercel.com> and sign in **with GitHub**.
2. Click **Add New… → Project**.
3. Pick your `ebay-lister-web` repository and click **Import**.
4. Before clicking Deploy, open **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your Anthropic key (`sk-ant-...`)
5. Click **Deploy** and wait about a minute.

### Step 3 — Use it

Vercel gives you a URL like `https://ebay-lister-web.vercel.app`. Open it,
**bookmark it on your Mac and add it to your phone's home screen**, and you're
done — no Terminal ever again.

---

## How it works (for the curious)

- **Frontend** (`app/page.tsx`, `app/ResultCard.tsx`): the upload UI. Photos are
  shrunk to ~1024px in your browser before upload, so they're small and fast.
- **API** (`app/api/analyze/route.ts`): runs on Vercel's servers. It holds your
  Anthropic key, picks the right item "profile", and asks Claude to write the
  listing. The prompts in `lib/prompts.ts` are ported directly from your
  original Python script.
- **Nothing is stored.** Photos are used to write the listing and then
  discarded.

---

## Roadmap

- **Phase 2 — eBay publishing.** Connect your eBay account and post listings
  with one click (requires a one-time setting in your eBay developer account).
- **Phase 3 — multi-item sorting.** Upload a pile of photos and have them
  grouped into separate listings automatically (like the script's `--intake`).
