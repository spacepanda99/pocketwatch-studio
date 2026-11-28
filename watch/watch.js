// A prospect's page: <site>/<slug> (readable, e.g. /bison-plumbing; 404.html loads this page there and sets
// window.PW_ID) or the older /watch/?id=<token>. Their commercials in two groups (4 widescreen, 4 vertical), each
// previewed in the composite player (player.js: layers, nothing rendered yet), single and package prices, and the
// introductory offer (30% off for the 14 days of the email campaign: first email on day 0, follow-ups on days 3, 7
// and 13; the day-13 email is the "last chance" one).
//
// Everything comes from, and checkout goes through, two Firebase functions on ProfilePilot's project
// (functions/pocketwatch.js there): pwGetOffer (page data, prices worked out on the server) and pwCheckout (makes the
// Stripe Checkout session). Payment is Stripe's embedded form in the #checkout section at the bottom of this page.
// After paying, pwGetOffer is called with the session id, the order is recorded (the Stripe webhook records it too),
// and we render the videos and email the download link (they are not ready the moment the payment goes through).
// A session's contents are fixed, so changing the order closes the form; Continue opens a new one.
// If Stripe.js can't load, the buyer is sent to Stripe's own checkout page instead.
// Publishable key, safe in public code (same account as ProfilePilot's js/stripe-config.js).
const STRIPE_KEY = 'pk_live_51U7g0q25dTAGrbc02SiAnZsrhQdT5MtBvNGjSqc8kuFYaMfkEh3REoXSWyzp7EYNjJ3fmz8gJVvPmohr1yYPpluC008ypv2MKo';
const API = 'https://us-central1-skillsprouts-f2787.cloudfunctions.net/';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const token = (window.PW_ID || params.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '');
const sessionId = (params.get('session_id') || '').replace(/[^A-Za-z0-9_]/g, '');
const preview = params.get('preview') === '1';   // the admin looking: not counted as a visit
const picked = new Set();   // videos ticked to buy together
let data = null, pkgOn = false, pkgOffScreen = false, scrolled = false, coOnScreen = false;
let wantSet = false;          // "get the set" was pressed
let form = null;              // the mounted Stripe form
let run = 0;                  // goes up whenever the form is closed, so a slow answer for an old order is dropped
let busy = false, paidNow = false, stripeJs = null;

// Firebase callable functions over plain fetch (no SDK needed): POST {data}, answer {result} or {error}.
async function call(name, data) {
  const r = await fetch(API + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || 'Something went wrong.'); e.status = j.error && j.error.status; throw e; }
  return j.result;
}

function missing() { $('loading').hidden = true; $('app').hidden = true; $('missing').hidden = false; }

// the discount as shown, worked out from the prices the server sent (they're set in the admin panel)
const off = (P) => Math.round((1 - P.now.single / P.regular.single) * 100);

function card(v, live, P) {
  const el = document.createElement('article');
  el.className = 'vid ' + v.shape + (v.paid ? ' is-paid' : '');
  el.dataset.id = v.id;
  el.innerHTML = `
    <div class="vid-frame ${v.shape}">${v.composite ? '' : `<div class="vid-soon"><span>Preview coming soon</span></div>`}</div>
    <div class="vid-info">
      <h3>${esc(v.title || 'Commercial')}${v.lang ? ` <span>· ${esc(v.lang)}</span>` : ''}</h3>
      <p class="vid-use">${v.shape === 'tall' ? 'Vertical 9:16' : 'Widescreen 16:9'}</p>
      <div class="vid-buy">
        ${v.paid
          ? `<span class="vid-paid">✓ Bought. We'll email your file.</span>`
          : `<p class="price small">${live ? `<s>${money(P.regular.single)}</s> ` : ''}<strong>${money(P.now.single)}</strong></p>
             <button type="button" class="btn btn-ghost btn-small pick" data-pick="${esc(v.id)}" aria-pressed="false" aria-label="Select ${esc(v.title || 'this commercial')} (${v.shape === 'tall' ? 'vertical' : 'widescreen'}), ${money(P.now.single)}">Select</button>`}
      </div>
      ${live && !v.paid ? '<p class="vid-left">${off(P)}% off ends in <span class="clock"></span></p>' : ''}
    </div>`;
  if (v.composite) PWPlayer.mount(el.querySelector('.vid-frame'), v.composite);
  return el;
}

function render(d) {
  let countdown = null;
  const P = d.offer, live = P.live, end = P.end ? new Date(P.end) : null;
  const vids = d.videos || [], wide = vids.filter((v) => v.shape !== 'tall'), tall = vids.filter((v) => v.shape === 'tall');
  const anyPaid = vids.some((v) => v.paid), unpaid = vids.filter((v) => !v.paid);
  document.title = `Commercials for ${d.business} · Pocket Watch Studio`;
  $('thanks').hidden = !d.justPaid;
  $('pkg-clock').hidden = $('bar-clock').hidden = !live;

  for (const x of document.querySelectorAll('.off-pct')) x.textContent = off(P);
  // the offer box (the end time comes from the server, which is what decides the price). It ends at midnight Hawaii
  // time, so the last day is named in Hawaii time too (elsewhere in the U.S. that is the same calendar day).
  $('deal').hidden = !(live && end && unpaid.length);
  if (!$('deal').hidden) {
    $('deal-text').innerHTML = `Order by <strong>${new Date(end - 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Pacific/Honolulu' })}</strong> to get the introductory price.`;
    // one countdown, shown the same way everywhere there is a .clock (deal box, each video, the full set, the bar)
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) { if (!form && !paidNow) location.reload(); return; }   // never wipe a card half typed in
      const s = Math.floor(ms / 1000), two = (n) => String(n).padStart(2, '0');
      const parts = [[Math.floor(s / 86400), 'days'], [two(Math.floor(s / 3600) % 24), 'hrs'], [two(Math.floor(s / 60) % 60), 'min'], [two(s % 60), 'sec']];
      const html = parts.map(([n, u]) => `<span><b>${n}</b><i>${u}</i></span>`).join('');
      for (const c of document.querySelectorAll('.clock')) c.innerHTML = html;
    };
    countdown = () => { tick(); setInterval(tick, 1000); };
  }

  // the package: everything on the page, only while nothing has been bought one by one
  data = d; pkgOn = vids.length >= 2 && !anyPaid;
  $('pkg-wrap').hidden = !pkgOn;
  if (pkgOn) {
    $('pkg-title').textContent = `All ${vids.length} commercials`;
    $('pkg-desc').textContent = wide.length && tall.length ? `Every commercial on this page: ${wide.length} widescreen and ${tall.length} vertical, in one checkout.` : 'Every commercial on this page, in one checkout.';
    $('pkg-list').innerHTML = [wide.length && `${wide.length} × widescreen`, tall.length && `${tall.length} × vertical`, 'Full-quality files', 'Yours to keep', 'Exclusive local rights to the characters'].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
    $('pkg-now').textContent = money(P.now.pkg);
    const oneByOne = P.now.single * vids.length, saved = oneByOne - P.now.pkg;
    // during the offer the crossed-out price is the set's own regular price, so it reads $699 to $489.30
    $('pkg-was').textContent = live ? money(P.regular.pkg) : saved > 0 ? money(oneByOne) : '';
    $('pkg-each').textContent = `About ${money(Math.round(P.now.pkg / vids.length))} a video instead of ${money(P.now.single)}`;
    $('pkg-save').textContent = live ? `You save ${money(P.regular.pkg - P.now.pkg)} on the full set.` : saved > 0 ? `You save ${money(saved)} over buying them one at a time.` : '';
  }
  // under each group: what the same video costs inside the set
  for (const tip of ['wide-tip', 'tall-tip']) {
    $(tip).hidden = !pkgOn;
    if (pkgOn) $(tip).innerHTML = `Select the ones you want, or <button type="button" class="linkbtn" data-buy="package">get all ${vids.length} for ${money(P.now.pkg)}</button> (about ${money(Math.round(P.now.pkg / vids.length))} each).`;
  }

  for (const [list, box, group] of [[wide, 'vids-wide', 'g-wide'], [tall, 'vids-tall', 'g-tall']]) {
    $(group).hidden = !list.length; $(box).innerHTML = '';
    for (const v of list) $(box).appendChild(card(v, live, P));
  }
  if (countdown) countdown();
  for (const b of document.querySelectorAll('[data-buy]')) b.addEventListener('click', () => { wantSet = true; checkout(); });
  for (const b of document.querySelectorAll('[data-pick]')) b.addEventListener('click', () => toggle(b));
  $('bar-picks').addEventListener('click', () => { wantSet = false; checkout(); });
  $('co-pay').addEventListener('click', () => checkout());
  $('co-change').addEventListener('click', () => { closeForm(); summary(); $('co-title').focus({ preventScroll: true }); });

  // nothing left to buy: no checkout section
  $('checkout').hidden = !unpaid.length;
  document.querySelector('.w-secure').hidden = !unpaid.length;
  summary();
  new IntersectionObserver(([en]) => { coOnScreen = en.isIntersecting; bar(); }).observe($('checkout'));

  // the sticky bar: the picks and what the set would cost; with nothing picked, the set once they scroll, while its
  // card is off screen (never on first load, so nothing covers the videos)
  document.body.classList.add('has-bar');
  if (pkgOn) new IntersectionObserver(([en]) => { pkgOffScreen = !en.isIntersecting; bar(); }).observe($('pkg'));
  if (pkgOn) addEventListener('scroll', () => { const s = scrollY > 200; if (s !== scrolled) { scrolled = s; bar(); } }, { passive: true });
  $('loading').hidden = true; $('app').hidden = false;
}

function toggle(b) {
  const id = b.dataset.pick, on = !picked.has(id);
  if (on) picked.add(id); else picked.delete(id);
  b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ Selected' : 'Select';
  b.closest('.vid').classList.toggle('is-picked', on);
  wantSet = false;
  changed();
}

function changed() { closeForm(); summary(); bar(); }

// What would be bought now. When the picks cost as much as the set or more, it is the set (the server charges the set
// price then too, so nobody pays more for fewer videos).
function order() {
  const P = data.offer.now, vids = data.videos, picks = vids.filter((v) => picked.has(v.id) && !v.paid);
  const asSet = pkgOn && (wantSet || picks.length * P.single >= P.pkg);
  const lines = asSet
    ? [{ title: `All ${vids.length} commercials`, note: 'The full set', price: P.pkg }]
    : picks.map((v) => ({ id: v.id, title: v.title || 'Commercial', note: v.shape === 'tall' ? 'Vertical 9:16' : 'Widescreen 16:9', price: P.single }));
  return { asSet, picks, lines, total: lines.reduce((n, l) => n + Math.round(l.price * 100), 0) / 100 };
}

// The order as listed in the checkout section. The set can be removed only when it was asked for by its button (picks
// that add up to more than the set stay sold as the set).
function summary() {
  if (paidNow) return;
  const P = data.offer.now, o = order(), n = o.lines.length, all = data.videos.length;
  const canDrop = (l) => l.id || o.picks.length * P.single < P.pkg;
  $('co-lines').innerHTML = o.lines.map((l) => `<li><span><b>${esc(l.title)}</b><i>${l.note}</i></span><em>${money(l.price)}</em>${
    canDrop(l) ? `<button type="button" class="co-x" data-drop="${esc(l.id || '')}" aria-label="Remove ${esc(l.title)}">×</button>` : ''}</li>`).join('');
  for (const x of $('co-lines').querySelectorAll('[data-drop]')) x.addEventListener('click', () => {
    if (!x.dataset.drop) { wantSet = false; changed(); return; }
    document.querySelector(`.pick[data-pick="${x.dataset.drop}"]`).click();
  });
  $('co-empty').hidden = !!n;
  $('co-total').hidden = $('co-pay').hidden = !n;
  $('co-sum').textContent = money(o.total);
  const nudge = $('co-nudge');
  nudge.hidden = !pkgOn || o.asSet;
  if (!nudge.hidden) {
    nudge.innerHTML = `<button type="button" class="linkbtn">Get all ${all} for ${money(P.pkg)}</button>${n ? ` (${money(P.pkg - o.total)} more)` : ''}`;
    nudge.firstElementChild.addEventListener('click', () => { wantSet = true; checkout(); });
  }
}

function closeForm() {
  run++; busy = false;
  if (form) { form.destroy(); form = null; }
  $('co-form').innerHTML = '';
  $('co-head').hidden = $('co-status').hidden = $('co-error').hidden = true;
  if (!paidNow) $('co-order').hidden = false;
}

function stripe() {
  if (!stripeJs) stripeJs = new Promise((ok, no) => {
    const s = document.createElement('script');
    const fail = () => { stripeJs = null; s.remove(); no(new Error('Stripe.js did not load')); };
    const timer = setTimeout(fail, 12000);
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => { clearTimeout(timer); if (window.Stripe) ok(window.Stripe(STRIPE_KEY)); else fail(); };
    s.onerror = () => { clearTimeout(timer); fail(); };
    document.head.appendChild(s);
  });
  return stripeJs;
}

const toCheckout = () => $('checkout').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

// Bring the checkout section into view and open Stripe's form there for the current order.
async function checkout() {
  if (paidNow || busy) return toCheckout();
  closeForm(); summary(); bar();
  const o = order();
  toCheckout();
  if (!o.lines.length) return;
  const mine = run, what = o.asSet ? { item: 'package' } : { items: o.picks.map((v) => v.id) };
  busy = true;
  $('co-order').hidden = true;
  $('co-head').hidden = false;
  $('co-head-title').textContent = o.lines.length === 1 ? o.lines[0].title : `${o.lines.length} commercials`;
  $('co-head-sum').textContent = money(o.total);
  $('co-status').textContent = 'Opening secure payment…';
  $('co-status').hidden = false;
  const failed = (e) => {
    if (mine !== run) return;
    closeForm(); summary();
    $('co-error').textContent = e.message || 'Checkout didn\'t open. Please try again.';
    $('co-error').hidden = false;
  };
  let js;
  try { js = await stripe(); }
  catch (e) {   // the form can't load here: use Stripe's own checkout page
    if (mine !== run) return;
    try { const r = await call('pwCheckout', { token, ...what }); if (mine === run) location.href = r.url; } catch (err) { failed(err); }
    return;
  }
  try {
    const r = await call('pwCheckout', { token, ...what, embedded: true });
    if (mine !== run) return;
    const made = await js.initEmbeddedCheckout({ clientSecret: r.clientSecret, onComplete: () => done(r.sessionId, o) });
    if (mine !== run) return made.destroy();   // the order changed while it was loading
    form = made;
    form.mount('#co-form');
    busy = false;
    $('co-status').hidden = true;
  } catch (e) { failed(e); }
}

// Paid, without leaving the page: thank them here, mark what they bought, and record the order.
async function done(id, o) {
  paidNow = true;
  const bought = new Set(o.asSet ? data.videos.map((v) => v.id) : o.picks.map((v) => v.id));
  closeForm();
  $('co-order').hidden = $('co-note').hidden = $('co-title').hidden = true;
  $('co-done').hidden = false;
  for (const v of data.videos) {
    if (!bought.has(v.id)) continue;
    v.paid = true;
    const el = document.querySelector(`.vid[data-id="${v.id}"]`);
    el.classList.remove('is-picked'); el.classList.add('is-paid');
    el.querySelector('.vid-buy').innerHTML = '<span class="vid-paid">✓ Bought. We\'ll email your file.</span>';
    const left = el.querySelector('.vid-left'); if (left) left.remove();
  }
  // another order starts with a fresh page, so the prices and the set offer come from the server again
  pkgOn = false;
  $('pkg-wrap').hidden = $('deal').hidden = $('wide-tip').hidden = $('tall-tip').hidden = true;
  for (const b of document.querySelectorAll('[data-pick]')) b.hidden = true;
  picked.clear(); bar(); toCheckout();
  try { await call('pwGetOffer', { token, sessionId: id }); } catch (e) { /* the Stripe webhook records it too */ }
  if (data.videos.some((v) => !v.paid)) {
    const again = document.createElement('button');
    again.type = 'button'; again.className = 'btn btn-ghost btn-small'; again.textContent = 'Buy more videos';
    again.addEventListener('click', () => location.reload());
    $('co-done').appendChild(again);
  }
}

// The sticky bar's words and buttons (it steps aside while the checkout section is on screen). When the picks cost as
// much as the set or more, only the set is offered.
function bar() {
  const P = data.offer.now, n = picked.size, total = n * P.single, all = data.videos.length;
  const better = pkgOn && total >= P.pkg, show = !paidNow && !coOnScreen && (n > 0 || (pkgOn && pkgOffScreen && scrolled));
  const el = $('bar'), picks = $('bar-picks'), set = $('bar-set'), meter = $('bar-meter');
  if (!n) { $('bar-title').textContent = `All ${all} commercials · ${money(P.pkg)}`; $('bar-sub').textContent = `Save ${money(Math.max(0, all * P.single - P.pkg))} over one at a time`; }
  else if (better) { $('bar-title').textContent = `Get all ${all} for ${money(P.pkg)}`; $('bar-sub').textContent = `Less than the ${money(total)} your ${n} picks cost on their own`; }
  else {
    $('bar-title').textContent = `${n} selected · ${money(total)}`;
    $('bar-sub').textContent = pkgOn ? `${money(P.pkg - total)} more gets all ${all}` : 'One checkout';
  }
  picks.hidden = !n || better; picks.textContent = `Buy ${n === 1 ? 'this one' : 'these ' + n}`;
  set.hidden = !pkgOn; set.textContent = better ? `Get all ${all}` : `All ${all} · ${money(P.pkg)}`;
  meter.hidden = !pkgOn || !n; meter.firstElementChild.style.width = Math.min(100, (total / P.pkg) * 100) + '%';
  el.classList.toggle('show', show); el.setAttribute('aria-hidden', show ? 'false' : 'true');
  for (const x of el.querySelectorAll('button')) x.tabIndex = show ? 0 : -1;
}

// Coming back from Stripe's own page with the Back button can restore this page mid-checkout.
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

(async () => {
  if (!token) return missing();
  try {
    const d = await call('pwGetOffer', { token, sessionId: sessionId || undefined, preview: preview || undefined });
    if (sessionId) history.replaceState(null, '', window.PW_ID ? location.pathname : location.pathname + '?id=' + encodeURIComponent(token));
    render(d);
  } catch (e) { missing(); }
})();
