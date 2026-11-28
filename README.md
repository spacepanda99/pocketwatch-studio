# Pocket Watch Studio

The website for Pocket Watch Studio (short commercials for local businesses). A plain static site:
`index.html`, `styles.css`, `main.js`, `privacy.html`, `terms.html`, `404.html`, `assets/logo.svg`.
No build step, no framework, system fonts only, so it loads fast on phones.

**Purpose:** prospects arrive from cold emails and calls, not Google. The page has to look solid and
trustworthy and show sample work. **No pricing on the home page**: outreach videos come from templates,
pricing is only for custom work and is handled one to one.

## Preview locally

```
node tools/serve.mjs 8080
```
then open http://localhost:8080.

## Hosting

GitHub Pages from the `main` branch, root folder. Repo: `spacepanda99/pocketwatch-studio` (public, so Pages is free).
It lives at https://pocketwatch.studio/ (domain at Namecheap, set up 2026-11-27).

## Domain setup (done 2026-11-27; kept for reference)

Do NOT add the custom domain before the domain is owned and its DNS is set, or the github.io address
starts redirecting to a domain that doesn't work yet.

1. **DNS at Namecheap** (Domain List → Manage → Advanced DNS), remove the default parking records, then add:
   - `A` record, host `@`, value `185.199.108.153`
   - `A` record, host `@`, value `185.199.109.153`
   - `A` record, host `@`, value `185.199.110.153`
   - `A` record, host `@`, value `185.199.111.153`
   - `CNAME` record, host `www`, value `spacepanda99.github.io.`
2. **GitHub:** repo → Settings → Pages → Custom domain → `pocketwatch.studio` → Save. This adds a `CNAME`
   file to the repo. When the check passes (minutes to a few hours), tick **Enforce HTTPS**.
3. Optional but recommended: Settings → Pages → verify the domain for the account, which stops anyone
   else from claiming it on GitHub Pages.

## Email (later)

The domain needs proper email authentication (SPF, DKIM, DMARC) before any cold email goes out, and
cold outreach is best sent from a separate domain so spam complaints can't hurt this one. Every outreach
email needs a real mailing address and an unsubscribe link (CAN-SPAM).

## Contact form

`main.js` posts to the `pwContact` function (ProfilePilot's `functions/pw-admin.js`), which saves the message, shows it
in the admin panel under Messages and emails it to the admin (30 a day at most). A hidden `website` field catches bots.

## Admin panel (admin/)

https://pocketwatch.studio/admin/ : prospecting, the commercial factory, client pages, outreach, orders, messages and
settings. Sign in with a ProfilePilot admin account. The page is public code with no keys or data in it; everything
goes through the admin-only `pwAdmin` function. The factory itself runs on the PC: ProfilePilot's
`video-editor/pw-worker.mjs` (Windows task "Pocket Watch Worker") takes the jobs the panel queues.
Bump `?v=` on `admin.css` / `admin.js` when they change.

## Adding sample videos

In `index.html`, section `#work`: copy a `<figure class="sample">`, remove the `soon` class, and replace the
placeholder `<span>` with
`<video src="videos/name.mp4" poster="videos/name.jpg" controls playsinline preload="none"></video>`.
Keep files small (H.264 MP4, a few MB). Bump `?v=` on `styles.css` / `main.js` when they change.

## Prospect pages (watch/)

Each prospect gets a private page: `/watch/?id=<token>`: 4 widescreen (16:9) and 4 vertical (9:16) commercials,
a price on each, the package (all of them), and the 30%-off countdown. Try it: `/watch/?id=demo`
(`node tools/seed-demo.cjs` rewrites the demo).

**Data and checkout run on ProfilePilot's Firebase + live Stripe account** (the user's choice, 2026-11-27), in
`C:\Mikes Stuff\ProfilePilot\Website\functions\pocketwatch.js`: `pwGetOffer` (page data) and `pwCheckout` (Stripe Checkout, paid in Stripe's embedded form in the `#checkout` section at the bottom of the page).
Each prospect is a Firestore doc `pwOffers/<token>`: `{ business, logo, email, offerStart "YYYY-MM-DD", offerDays,
videos: [{ id, title, shape "wide"|"tall", composite }] }`. Use long random tokens for real prospects.

**Previews are composites, not MP4s** (the user's rule): `watch/player.js` plays the editor's layers (picture, voice,
music, motion graphics) like ProfilePilot's `/ad` page. Publish a commercial with ProfilePilot's
`node video-editor/share.mjs <projectId>` and put the token it prints (after `?c=`) in the video's `composite` field.
A video without one shows a "Preview coming soon" placeholder.

**After payment** the videos still have to be rendered, so nothing downloads straight away: the page thanks the
buyer and says we'll email the link. The order is saved in Firestore `pwOrders/<stripe session id>` (status
`to-render`) and the admin gets an email listing what to render. Rendering and emailing the buyer the files is
manual for now.

**Offer:** 30% off for the 14 days of the email campaign (first email day 0, follow-ups days 3, 7 and 13;
the day-13 email is "last chance"). Prices are set on the server (`PRICES` in pocketwatch.js; a prospect doc's
`prices` can override them), so the page can't be tricked into a lower price:
- during the offer: $97.30 per video, $489.30 for the package
- after it: $139 per video, $699 for the package

The offer ends at midnight Hawaii time at the end of day 13, the latest U.S. time zone, so nobody is charged more than the page showed.
The package is only offered while nothing on the page has been bought one by one.

## Legal pages

`privacy.html` and `terms.html` are plain-English starting drafts, not legal advice. Have them checked before launch.

## To do: record the buyer's TV market (DMA) after checkout (noted 2026-11-25)

Each business should have a **TV broadcast area** field (a Nielsen DMA; there are about 210 in the U.S.). It is worked out
**once, when someone checks out**, not in a batch, so there are no bulk Firestore writes and no automatic triggers wake up.

How:
1. After a successful Stripe payment (the webhook, or the success page), take the business's county (from its address or
   lat/lng, using the free Census geocoder) and look it up in a county-to-DMA table.
2. Save the DMA name on that one business's record.

Data: no free, current, official list exists (Nielsen sells the official ZIP-by-DMA files for about $2,500 to $8,300, licensed
for 12 months). A free county-to-DMA list is saved at `C:\Mikes Stuff\ProfilePilot\Website\data-dma\dma.csv`, from GitHub
`alex-patton/US-TVDMA-BY-COUNTY` (3,149 counties, 212 DMAs, repo updated March 2026, no licence stated, matches by state and
county NAME with no county codes, so names like "DE KALB" and "ST. JOHNS" need normalising against the Census county list).
Treat it as a good approximation; if it ever matters, buy Nielsen's file.

Not built yet: the lookup. (The checkout is built: see Prospect pages. The webhook branch to hook it into is the
`pwToken` one in ProfilePilot's `stripeWebhook`.)
