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
Until the domain is set up it lives at https://spacepanda99.github.io/pocketwatch-studio/.

## When the domain is bought (pocketwatch.studio)

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

`main.js` → `FORM_ENDPOINT` is empty for now, so the form politely says it isn't connected yet.
Options to connect it:
- A Firebase Cloud Function (same Firebase project as the checkout and downloads later) that emails the
  message. Fits the plan, needs the Blaze plan.
- A form service (Formspree, Web3Forms, etc.): sign up, paste its endpoint URL into `FORM_ENDPOINT`.

The form posts JSON `{ name, business, email, phone, message }`. A hidden `website` field catches bots.

## Adding sample videos

In `index.html`, section `#work`: copy a `<figure class="sample">`, remove the `soon` class, and replace the
placeholder `<span>` with
`<video src="videos/name.mp4" poster="videos/name.jpg" controls playsinline preload="none"></video>`.
Keep files small (H.264 MP4, a few MB). Bump `?v=` on `styles.css` / `main.js` when they change.

## Legal pages

`privacy.html` and `terms.html` are plain-English starting drafts, not legal advice. Have them checked before launch.
