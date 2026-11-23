// A prospect's private page: their four commercials, single and package prices, and the
// introductory offer (40% off for the 14 days of the email campaign: first email on day 0,
// follow-ups on days 3, 7 and 13; the day-13 email is the "last chance" one).
//
// URL: /watch/?id=<token>. The page loads <DATA_BASE><token>.json. Tokens should be long and random
// so pages can't be guessed. ?id=demo uses watch/demo.json from this repo.
const DATA_BASE = './';            // later: the Firebase Storage folder that holds prospects' JSON and videos
const OFFER_DAYS = 14;
const PRICES = {                   // US dollars; a prospect's JSON can override any of these
  offer:   { single: 149, pkg: 499 },
  regular: { single: 249, pkg: 829 },
};

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + n.toLocaleString('en-US');
const params = new URLSearchParams(location.search);
const token = (params.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '');

function missing() { for (const s of document.querySelectorAll('#app > section')) s.hidden = true; $('missing').hidden = false; }

function deadlineOf(d) {
  // the offer ends at midnight at the end of day 13 (the visitor's own time zone): 14 days counting the day of the first email
  const start = new Date((d.offerStart || '') + 'T00:00:00');
  if (isNaN(start)) return null;
  const end = new Date(start); end.setDate(end.getDate() + (d.offerDays || OFFER_DAYS) - 1);   // day 0 is the first email; the last day is day 13, the same day as the last-chance email
  end.setHours(23, 59, 59, 0);
  return end;
}

function render(d) {
  const P = { offer: { ...PRICES.offer, ...(d.prices && d.prices.offer) }, regular: { ...PRICES.regular, ...(d.prices && d.prices.regular) } };
  const end = deadlineOf(d), live = end && Date.now() <= end.getTime();
  const now = live ? P.offer : P.regular;
  document.title = `Commercials for ${d.business} · Pocket Watch Studio`;
  $('biz-name').textContent = d.business;
  if (d.logo) { $('biz-logo').src = d.logo; $('biz-logo').alt = d.business + ' logo'; $('biz-logo').hidden = false; }

  // the offer box
  $("deal").hidden = !live; $("pkg-was").textContent = "";
  if (live) {
    $('deal').hidden = false;
    $('deal-text').innerHTML = `Order by <strong>${end.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong> to get the introductory price.`;
    const tick = () => {
      const ms = end - Date.now(); if (ms <= 0) { location.reload(); return; }
      const days = Math.floor(ms / 864e5), hrs = Math.floor(ms / 36e5) % 24, mins = Math.floor(ms / 6e4) % 60;
      $('deal-clock').textContent = days >= 1 ? `${days} day${days > 1 ? 's' : ''}, ${hrs} hour${hrs === 1 ? '' : 's'} left` : `${hrs} hour${hrs === 1 ? '' : 's'}, ${mins} minute${mins === 1 ? '' : 's'} left`;
    };
    tick(); setInterval(tick, 30000);
  }

  // the package
  const vids = d.videos || [];
  $('pkg-list').innerHTML = vids.map((v) => `<li>${v.label} · ${v.lang}</li>`).join('');
  $('pkg-now').textContent = money(now.pkg);
  if (live) { $('pkg-was').textContent = money(P.regular.pkg); $('pkg-save').textContent = `You save ${money(P.regular.pkg - now.pkg)} until the offer ends.`; }
  else { $('pkg-save').textContent = `${money(now.single * vids.length - now.pkg)} less than buying them one at a time.`; }
  buyLink($('pkg-btn'), d.packageCheckout);

  // the single videos
  $('vids').innerHTML = '';
  for (const v of vids) {
    const card = document.createElement('article'); card.className = 'vid';
    const media = v.src
      ? `<video src="${v.src}" ${v.poster ? `poster="${v.poster}"` : ''} controls playsinline preload="metadata"></video>`
      : `<div class="vid-soon"><span>Your video goes here</span></div>`;
    card.innerHTML = `
      <div class="vid-frame ${v.shape === 'tall' ? 'tall' : 'wide'}">${media}</div>
      <div class="vid-info">
        <h3>${v.label} <span>· ${v.lang}</span></h3>
        <p class="vid-use">${v.shape === 'tall' ? 'For phones: Reels, TikTok, Shorts' : 'For TV, YouTube and your website'}</p>
        <p class="price small">${live ? `<s>${money(P.regular.single)}</s> ` : ''}<strong>${money(now.single)}</strong></p>
        <a class="btn btn-ghost btn-small" href="#">Buy this one</a>
      </div>`;
    buyLink(card.querySelector('a'), v.checkout);
    $('vids').appendChild(card);
  }
}

// Each button goes to its Stripe Payment Link. Until those exist, the button says so instead of failing.
function buyLink(a, url) {
  if (url) { a.href = url; return; }
  a.addEventListener('click', (e) => { e.preventDefault(); alert('Checkout is being set up. Please reply to our email and we\'ll send you a payment link.'); });
}

(async () => {
  if (!token) return missing();
  try {
    const r = await fetch(DATA_BASE + token + '.json', { cache: 'no-store' });
    if (!r.ok) return missing();
    render(await r.json());
  } catch (e) { missing(); }
})();
