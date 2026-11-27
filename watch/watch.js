// A prospect's private page: /watch/?id=<token>. Their commercials in two groups (4 widescreen, 4 vertical), each
// previewed in the composite player (player.js: layers, nothing rendered yet), single and package prices, and the
// introductory offer (40% off for the 14 days of the email campaign: first email on day 0, follow-ups on days 3, 7
// and 13; the day-13 email is the "last chance" one).
//
// Everything comes from, and checkout goes through, two Firebase functions on ProfilePilot's project
// (functions/pocketwatch.js there): pwGetOffer (page data, prices worked out on the server) and pwCheckout (opens
// Stripe Checkout). After paying, the buyer comes back with ?session_id=..., the order is recorded, and we render the
// videos and email the download link (they are not ready the moment the payment goes through).
const API = 'https://us-central1-skillsprouts-f2787.cloudfunctions.net/';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const token = (params.get('id') || '').replace(/[^A-Za-z0-9_-]/g, '');
const sessionId = (params.get('session_id') || '').replace(/[^A-Za-z0-9_]/g, '');

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
             <button type="button" class="btn btn-ghost btn-small" data-buy="${esc(v.id)}" aria-label="Buy ${esc(v.title || 'this commercial')} for ${money(P.now.single)}">Buy this one</button>`}
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
  $('biz-name').textContent = d.business; $('biz-eyebrow').textContent = d.business;
  if (d.logo) { $('biz-logo').src = d.logo; $('biz-logo').alt = d.business + ' logo'; $('biz-logo').hidden = false; }
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
  const pkgOn = vids.length >= 2 && !anyPaid;
  $('pkg-wrap').hidden = !pkgOn;
  if (pkgOn) {
    $('pkg-title').textContent = `All ${vids.length} commercials`;
    $('pkg-desc').textContent = wide.length && tall.length ? `Every commercial on this page: ${wide.length} widescreen and ${tall.length} vertical, in one checkout.` : 'Every commercial on this page, in one checkout.';
    $('pkg-list').innerHTML = [wide.length && `${wide.length} × widescreen`, tall.length && `${tall.length} × vertical`, 'Full-quality files', 'Yours to keep'].filter(Boolean).map((x) => `<li>${x}</li>`).join('');
    $('pkg-now').textContent = money(P.now.pkg);
    const oneByOne = P.now.single * vids.length;
    if (live) { $('pkg-was').textContent = money(P.regular.pkg); $('pkg-save').textContent = `You save ${money(P.regular.pkg - P.now.pkg)} until the offer ends.`; }
    else { $('pkg-was').textContent = ''; $('pkg-save').textContent = oneByOne > P.now.pkg ? `${money(oneByOne - P.now.pkg)} less than buying them one at a time.` : ''; }
    $('bar-title').textContent = `All ${vids.length} commercials · ${money(P.now.pkg)}`;
    $('bar-sub').textContent = live ? `Save ${money(P.regular.pkg - P.now.pkg)}` : 'One checkout';
  }

  for (const [list, box, group] of [[wide, 'vids-wide', 'g-wide'], [tall, 'vids-tall', 'g-tall']]) {
    $(group).hidden = !list.length; $(box).innerHTML = '';
    for (const v of list) $(box).appendChild(card(v, live, P));
  }
  for (const b of document.querySelectorAll('[data-buy]')) b.addEventListener('click', () => buy(b));

  // the sticky "get the set" bar: only while the package card is scrolled off the top
  const bar = $('bar');
  if (pkgOn) {
    document.body.classList.add('has-bar');
    new IntersectionObserver(([en]) => {
      const off = !en.isIntersecting && en.boundingClientRect.top < 0;
      bar.classList.toggle('show', off); bar.setAttribute('aria-hidden', off ? 'false' : 'true');
      bar.querySelector('button').tabIndex = off ? 0 : -1;
    }).observe($('pkg'));
  }
  $('loading').hidden = true; $('app').hidden = false;
}

async function buy(b) {
  if (b.disabled) return;
  const label = b.textContent; b.disabled = true; b.textContent = 'Opening checkout…';
  try { const r = await call('pwCheckout', { token, item: b.dataset.buy }); location.href = r.url; }
  catch (e) { b.disabled = false; b.textContent = label; alert(e.message || 'Checkout didn\'t open. Please try again.'); }
}
// Coming back from Stripe with the Back button can restore this page with its buttons still disabled.
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });

(async () => {
  if (!token) return missing();
  try {
    const d = await call('pwGetOffer', { token, sessionId: sessionId || undefined });
    if (sessionId) history.replaceState(null, '', location.pathname + '?id=' + encodeURIComponent(token));
    render(d);
  } catch (e) { missing(); }
})();
