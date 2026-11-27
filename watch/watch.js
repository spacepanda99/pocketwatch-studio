// A prospect's page: <site>/<slug> (readable, e.g. /bison-plumbing; 404.html loads this page there and sets
// window.PW_ID) or the older /watch/?id=<token>. Their commercials in two groups (4 widescreen, 4 vertical), each
// previewed in the composite player (player.js: layers, nothing rendered yet), single and package prices, and the
// introductory offer (30% off for the 14 days of the email campaign: first email on day 0, follow-ups on days 3, 7
// and 13; the day-13 email is the "last chance" one).
//
// Everything comes from, and checkout goes through, two Firebase functions on ProfilePilot's project
// (functions/pocketwatch.js there): pwGetOffer (page data, prices worked out on the server) and pwCheckout (opens
// Stripe Checkout). After paying, the buyer comes back with ?session_id=..., the order is recorded, and we render the
// videos and email the download link (they are not ready the moment the payment goes through).
const API = 'https://us-central1-skillsprouts-f2787.cloudfunctions.net/';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const token = (window.PW_ID || params.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '');
const sessionId = (params.get('session_id') || '').replace(/[^A-Za-z0-9_]/g, '');
const picked = new Set();   // videos ticked to buy together
let data = null, pkgOn = false, pkgOffScreen = false, scrolled = false;

// Firebase callable functions over plain fetch (no SDK needed): POST {data}, answer {result} or {error}.
async function call(name, data) {
  const r = await fetch(API + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || 'Something went wrong.'); e.status = j.error && j.error.status; throw e; }
  return j.result;
}

function missing() { $('loading').hidden = true; $('app').hidden = true; $('missing').hidden = false; }

function card(v, live, P) {
  const el = document.createElement('article');
  el.className = 'vid ' + v.shape + (v.paid ? ' is-paid' : '');
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
    </div>`;
  if (v.composite) PWPlayer.mount(el.querySelector('.vid-frame'), v.composite);
  return el;
}

function render(d) {
  const P = d.offer, live = P.live, end = P.end ? new Date(P.end) : null;
  const vids = d.videos || [], wide = vids.filter((v) => v.shape !== 'tall'), tall = vids.filter((v) => v.shape === 'tall');
  const anyPaid = vids.some((v) => v.paid), unpaid = vids.filter((v) => !v.paid);
  document.title = `Commercials for ${d.business} · Pocket Watch Studio`;
  $('thanks').hidden = !d.justPaid;

  // the offer box (the end time comes from the server, which is what decides the price). It ends at midnight Hawaii
  // time, so the last day is named in Hawaii time too (elsewhere in the U.S. that is the same calendar day).
  $('deal').hidden = !(live && end && unpaid.length);
  if (!$('deal').hidden) {
    $('deal-text').innerHTML = `Order by <strong>${new Date(end - 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Pacific/Honolulu' })}</strong> to get the introductory price.`;
    const tick = () => {
      const ms = end - Date.now(); if (ms <= 0) { location.reload(); return; }
      const days = Math.floor(ms / 864e5), hrs = Math.floor(ms / 36e5) % 24, mins = Math.floor(ms / 6e4) % 60;
      $('deal-clock').textContent = days >= 1 ? `${days} day${days > 1 ? 's' : ''}, ${hrs} hour${hrs === 1 ? '' : 's'} left` : `${hrs} hour${hrs === 1 ? '' : 's'}, ${mins} minute${mins === 1 ? '' : 's'} left`;
    };
    tick(); setInterval(tick, 30000);
  }

  // the package: everything on the page, only while nothing has been bought one by one
  data = d; pkgOn = vids.length >= 2 && !anyPaid;
  $('pkg-wrap').hidden = !pkgOn;
  if (pkgOn) {
    $('pkg-title').textContent = `All ${vids.length} commercials`;
    $('pkg-desc').textContent = wide.length && tall.length ? `Every commercial on this page: ${wide.length} widescreen and ${tall.length} vertical, in one checkout.` : 'Every commercial on this page, in one checkout.';
    $('pkg-list').innerHTML = [wide.length && `${wide.length} × widescreen`, tall.length && `${tall.length} × vertical`, 'Full-quality files', 'Yours to keep'].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
    $('pkg-now').textContent = money(P.now.pkg);
    const oneByOne = P.now.single * vids.length, saved = oneByOne - P.now.pkg;
    $('pkg-was').textContent = saved > 0 ? money(oneByOne) : '';
    $('pkg-each').textContent = `About ${money(Math.round(P.now.pkg / vids.length))} a video instead of ${money(P.now.single)}`;
    $('pkg-save').textContent = saved > 0 ? `You save ${money(saved)} over buying them one at a time.` : '';
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
  for (const b of document.querySelectorAll('[data-buy]')) b.addEventListener('click', () => buy(b, { item: b.dataset.buy }));
  for (const b of document.querySelectorAll('[data-pick]')) b.addEventListener('click', () => toggle(b));
  $('bar-picks').addEventListener('click', () => buy($('bar-picks'), { items: [...picked] }));

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
  bar();
}

// The bar's words and buttons. When the picks cost as much as the set or more, only the set is offered (the server
// charges the set price then too, so nobody pays more for fewer videos).
function bar() {
  const P = data.offer.now, n = picked.size, total = n * P.single, all = data.videos.length;
  const better = pkgOn && total >= P.pkg, show = n > 0 || (pkgOn && pkgOffScreen && scrolled);
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

async function buy(b, what) {
  if (b.disabled) return;
  const label = b.textContent; b.disabled = true; b.textContent = 'Opening checkout…';
  try { const r = await call('pwCheckout', { token, ...what }); location.href = r.url; }
  catch (e) { b.disabled = false; b.textContent = label; alert(e.message || 'Checkout didn\'t open. Please try again.'); }
}
// Coming back from Stripe with the Back button can restore this page with its buttons still disabled.
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

(async () => {
  if (!token) return missing();
  try {
    const d = await call('pwGetOffer', { token, sessionId: sessionId || undefined });
    if (sessionId) history.replaceState(null, '', window.PW_ID ? location.pathname : location.pathname + '?id=' + encodeURIComponent(token));
    render(d);
  } catch (e) { missing(); }
})();
