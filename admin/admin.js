// Pocket Watch back office. Everything goes through the admin-only Cloud Function pwAdmin (ProfilePilot's
// functions/pw-admin.js); this page holds no keys and no data of its own. This repo is public: keep it that way.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { getStorage, ref, getBytes } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// a Firebase web config is public by design; access is decided by the signed-in account's admin claim
const app = initializeApp({ apiKey: 'AIzaSyBR6Y178cCWBqsF3mpLIbH_SWpDlU_VThU', authDomain: 'skillsprouts-f2787.firebaseapp.com', projectId: 'skillsprouts-f2787', storageBucket: 'skillsprouts-f2787.firebasestorage.app', appId: '1:672662248930:web:acabdf8ad026f80d0cadbb' });
const auth = getAuth(app);
const fn = httpsCallable(getFunctions(app), 'pwAdmin', { timeout: 60000 });
const api = async (action, data = {}) => (await fn({ action, ...data })).data;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const web = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const money = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const tag = (s) => `<span class="tag ${esc(s)}">${esc(s)}</span>`;
const SITE = location.hostname === 'pocketwatch.studio' ? '' : 'https://pocketwatch.studio';
const pageUrl = (slug) => `${SITE}/watch/?id=${encodeURIComponent(slug)}&preview=1`;
const EDITOR = 'https://profilepilot-e9d73.web.app/admin/editor?project=';
const STAGES = ['picked', 'scripted', 'ready', 'contacted', 'replied', 'won', 'lost', 'skip'];

let toastTimer;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  // an open drawer is in the top layer, so the message has to live inside it to be seen
  ($('#drawer').open ? $('#drawer') : document.body).appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, bad ? 7000 : 3000);
}
const errText = (e) => String((e && e.message) || e).replace(/^functions\/[a-z-]+:?\s*/, '');
// run something from a button: disable it meanwhile, report problems
async function act(btn, work, done) {
  if (btn) btn.disabled = true;
  try { const r = await work(); if (done) toast(done); return r; }
  catch (e) { toast(errText(e), true); return null; }
  finally { if (btn) btn.disabled = false; }
}
function on(el, sel, handler, type = 'click') { for (const x of $$(sel, el)) x.addEventListener(type, (e) => handler(x, e)); }

// ---------------------------------------------------------------- sign in
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; $('#login-msg').textContent = '';
  try { await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value); }
  catch { $('#login-msg').textContent = 'That email and password didn\'t work.'; }
});
$('#signout').addEventListener('click', () => signOut(auth));
onAuthStateChanged(auth, async (user) => {
  const admin = user && (await user.getIdTokenResult()).claims.admin === true;
  $('#login').hidden = !!admin; $('#app').hidden = !admin;
  if (user && !admin) { $('#login-msg').textContent = 'That account isn\'t an admin.'; await signOut(auth); }
  if (admin) route();
});

// ---------------------------------------------------------------- routing
let view = '', timer = null, turn = 0;
const views = {};
function route() {
  if (!auth.currentUser) return;
  view = (location.hash.slice(1) || 'today').split('/')[0];
  if (!views[view]) view = 'today';
  for (const a of $$('.tabs a')) a.classList.toggle('on', a.hash === '#' + view);
  clearTimeout(timer);
  draw(true);
}
// each section draws into its own element; a slow answer for a section you've left is thrown away
async function draw(fresh) {
  const mine = ++turn, box = document.createElement('div');
  if (fresh) $('#view').innerHTML = '<p class="empty">Loading…</p>';
  try { await views[view](box); }
  catch (e) { box.innerHTML = `<div class="card"><p>${esc(errText(e))}</p></div>`; }
  if (mine === turn) $('#view').replaceChildren(box);
}
addEventListener('hashchange', route);

function workerState(w) {
  const dot = $('#worker-dot');
  const up = w && Date.now() - (w.at || 0) < 5 * 60000;
  dot.className = 'dot-label' + (up ? (w.current ? ' busy' : ' on') : '');
  dot.textContent = !up ? 'Factory PC offline' : w.paused ? 'Factory paused' : w.current ? 'Factory working' : 'Factory ready';
  return up;
}

// ---------------------------------------------------------------- today
views.today = async (el) => {
  const d = await api('overview');
  const up = workerState(d.worker), failed = d.jobs.filter((j) => j.status === 'failed').length;
  const stat = (n, label, href, hot) => `<a class="stat${hot ? ' hot' : ''}" href="${href}"><b>${esc(n)}</b><span>${esc(label)}</span></a>`;
  el.innerHTML = `
    <h1>Today</h1>
    ${d.settings.paused ? '<p class="warn">The factory is paused. Turn it back on in Settings.</p>' : ''}
    ${up ? '' : '<p class="warn">The factory PC hasn\'t checked in for a while. Jobs will wait until it does.</p>'}
    <h2>Needs you</h2>
    <div class="grid">
      ${stat(d.due, 'follow-ups due', '#outreach', d.due)}
      ${stat(d.counts.ready, 'commercials ready to pitch', '#outreach', d.counts.ready)}
      ${stat(d.toDeliver, 'orders to deliver', '#orders', d.toDeliver)}
      ${stat(d.unread, 'unanswered messages', '#inbox', d.unread)}
    </div>
    <h2 style="margin-top:20px">Pipeline</h2>
    <div class="grid">${STAGES.filter((s) => s !== 'skip').map((s) => stat(d.counts[s], s, '#pipeline')).join('')}</div>
    <h2 style="margin-top:20px">Money and limits</h2>
    <div class="grid">
      ${stat(money(d.revenue), `sales, ${d.orders} order${d.orders === 1 ? '' : 's'}`, '#orders')}
      ${stat(`${d.usage.paid || 0} / ${d.settings.dailyPaidCap}`, 'paid jobs today', '#factory')}
      ${stat(`${d.usage.emails || 0} / ${d.settings.dailyEmailCap}`, d.settings.sendingEnabled ? 'pitch emails today' : 'emails (sending is off)', '#settings')}
      ${d.worker && d.worker.spend ? stat(`$${Number(d.worker.spend.usd).toFixed(2)}`, `of $${d.worker.spend.cap} Gemini budget used`, '#factory') : ''}
    </div>
    ${failed ? `<p class="warn" style="margin-top:16px">${failed} recent job${failed === 1 ? '' : 's'} failed. <a href="#factory">See why</a></p>` : ''}`;
};

// ---------------------------------------------------------------- find prospects
let pool = null, mineIds = null;
const F = { q: '', cat: '', state: '', email: false, make: true, hard: true, min: 0, page: 0 };
const picks = new Set();
async function loadPool() {
  const bytes = new Uint8Array(await getBytes(ref(getStorage(app), 'exports/pocketwatch/pool.json.gz')));
  const body = new Response(bytes).body;
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? await new Response(body.pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
  const d = JSON.parse(text);
  return { at: d.at, items: d.items.map((r) => Object.fromEntries(d.fields.map((f, i) => [f, r[i]]))) };
}
views.find = async (el) => {
  mineIds = new Set((await api('listProspects')).prospects.map((p) => p.id));
  if (!pool) { try { pool = await loadPool(); } catch (e) { if (e.code !== 'storage/object-not-found') throw e; } }
  const cats = pool ? [...new Set(pool.items.map((i) => i.category))].sort() : [];
  const states = pool ? [...new Set(pool.items.map((i) => i.state).filter(Boolean))].sort() : [];
  const opt = (list, cur, all) => `<option value="">${all}</option>` + list.map((x) => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
  el.innerHTML = `
    <h1>Find prospects</h1>
    <div class="card">
      <div class="row"><span class="grow soft">${pool ? `${pool.items.length.toLocaleString()} businesses in the pool, built ${when(pool.at)}` : 'The pool hasn\'t been built yet.'}</span>
        <button class="btn ghost" id="repool">Rebuild the pool</button></div>
      ${pool ? `<div class="grid" style="margin-top:12px">
        <label>Search<input id="q" type="search" value="${esc(F.q)}" placeholder="name, city or website"></label>
        <label>Trade<select id="cat">${opt(cats, F.cat, 'Every trade')}</select></label>
        <label>State<select id="state">${opt(states, F.state, 'Every state')}</select></label>
        <label>At least this many reviews<input id="min" type="number" min="0" value="${F.min}"></label></div>
        <div class="row" style="margin-top:10px">
          <label class="check"><input id="make" type="checkbox"${F.make ? ' checked' : ''}> Can make a commercial</label>
          <label class="check"><input id="email" type="checkbox"${F.email ? ' checked' : ''}> Has an email</label>
          <label class="check"><input id="hard" type="checkbox"${F.hard ? ' checked' : ''}> Hide names the voice got wrong</label></div>` : ''}
    </div>
    <div id="results"></div>
    <div class="card"><h2>Add one by hand</h2>
      <form id="manual" class="row end">
        <label class="grow">Website<input name="domain" required placeholder="example.com"></label>
        <label class="grow">Business name<input name="business"></label>
        <label class="grow">Email<input name="email" type="email"></label>
        <button class="btn ghost">Add</button>
      </form>
      <p class="small soft">A business added by hand can be tracked and contacted. The factory can only make commercials for businesses from the pool.</p>
    </div>`;
  $('#repool', el).onclick = (e) => act(e.target, () => api('queueJob', { type: 'pool' }), 'Queued. The factory PC will rebuild it.').then(() => { pool = null; });
  $('#manual', el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    act($('button', f), () => api('addProspects', { items: [{ domain: f.domain.value, business: f.business.value, email: f.email.value }] }), 'Added to the pipeline.').then((r) => r && f.reset());
  };
  if (!pool) return;
  const results = $('#results', el);
  const list = () => {
    const q = F.q.toLowerCase();
    const found = pool.items.filter((i) => (!F.cat || i.category === F.cat) && (!F.state || i.state === F.state) && (!F.make || i.canMake) && (!F.email || i.email)
      && (!F.hard || !i.hardName) && i.reviews >= F.min && (!q || `${i.name} ${i.city} ${i.domain}`.toLowerCase().includes(q))).sort((a, b) => b.reviews - a.reviews);
    const pages = Math.max(1, Math.ceil(found.length / 50)); F.page = Math.min(F.page, pages - 1);
    results.innerHTML = `<div class="card">
      <div class="row"><span class="grow">${found.length.toLocaleString()} match</span>
        <button class="btn red" id="add"${picks.size ? '' : ' disabled'}>Add ${picks.size || ''} to the pipeline</button></div>
      <div class="scroll"><table><thead><tr><th></th><th>Business</th><th>Where</th><th>Reviews</th><th>Reach them by</th></tr></thead><tbody>
      ${found.slice(F.page * 50, F.page * 50 + 50).map((i) => `<tr>
        <td>${mineIds.has(i.domain) ? tag('added') : `<input type="checkbox" data-pick="${esc(i.domain)}"${picks.has(i.domain) ? ' checked' : ''} aria-label="Pick ${esc(i.name)}">`}</td>
        <td><b>${esc(i.name)}</b><br><a class="small soft" href="https://${esc(i.domain)}" target="_blank" rel="noopener noreferrer">${esc(i.domain)}</a></td>
        <td>${esc([i.city, i.state].filter(Boolean).join(', '))}</td>
        <td>${i.reviews ? `${i.reviews}${i.rating ? ` <span class="soft">(${i.rating})</span>` : ''}` : ''}</td>
        <td class="small">${[i.email && esc(i.email), web(i.contactForm) && `<a href="${esc(i.contactForm)}" target="_blank" rel="noopener noreferrer">${i.hasForm === 0 ? 'contact page' : 'contact form'}</a>`, !i.email && !i.contactForm && '<span class="soft">no email or form found</span>', i.phone && esc(i.phone), !i.canMake && '<span class="soft">no usable logo</span>'].filter(Boolean).join('<br>')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row"><button class="btn ghost" id="prev"${F.page ? '' : ' disabled'}>Back</button><span class="soft">Page ${F.page + 1} of ${pages}</span><button class="btn ghost" id="next"${F.page < pages - 1 ? '' : ' disabled'}>Next</button></div>
    </div>`;
    on(results, '[data-pick]', (c) => { if (c.checked) picks.add(c.dataset.pick); else picks.delete(c.dataset.pick); const b = $('#add', results); b.disabled = !picks.size; b.textContent = `Add ${picks.size || ''} to the pipeline`; }, 'change');
    $('#prev', results).onclick = () => { F.page--; list(); };
    $('#next', results).onclick = () => { F.page++; list(); };
    $('#add', results).onclick = (e) => act(e.target, async () => {
      const items = pool.items.filter((i) => picks.has(i.domain)).slice(0, 100).map((i) => ({ ...i, business: i.name }));
      await api('addProspects', { items });
      for (const i of items) { mineIds.add(i.domain); picks.delete(i.domain); }
      list();
    }, 'Added to the pipeline.');
  };
  for (const [id, key] of [['q', 'q'], ['cat', 'cat'], ['state', 'state'], ['min', 'min'], ['make', 'make'], ['email', 'email'], ['hard', 'hard']]) {
    $('#' + id, el).addEventListener('input', (e) => { F[key] = e.target.type === 'checkbox' ? e.target.checked : key === 'min' ? Number(e.target.value) || 0 : e.target.value; F.page = 0; list(); });
  }
  list();
};

// ---------------------------------------------------------------- pipeline
let stageFilter = '';
const marked = new Set();
function prospectTable(list, extra) {
  return `<div class="scroll"><table><thead><tr>${extra ? '<th></th>' : ''}<th>Business</th><th>Stage</th><th>Page views</th><th>Contacts</th><th>Next</th></tr></thead><tbody>
    ${list.map((p) => `<tr class="click" data-open="${esc(p.id)}">
      ${extra ? `<td><input type="checkbox" data-mark="${esc(p.id)}"${marked.has(p.id) ? ' checked' : ''} aria-label="Pick ${esc(p.business)}"></td>` : ''}
      <td><button class="link">${esc(p.business)}</button><br><span class="small soft">${esc([p.city, p.state, p.category].filter(Boolean).join(' · '))}</span></td>
      <td>${tag(p.stage)}${p.unsubscribed ? ' ' + tag('unsubscribed') : ''}</td>
      <td>${p.views || ''}${p.lastViewedAt ? `<br><span class="small soft">${when(p.lastViewedAt)}</span>` : ''}</td>
      <td>${(p.touches || []).length || ''}</td>
      <td class="small">${p.nextTouchAt ? (p.nextTouchAt <= Date.now() ? '<b>due now</b>' : when(p.nextTouchAt)) : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}
const wireRows = (el) => on(el, '[data-open]', (tr, e) => { if (!e.target.matches('input,a')) openProspect(tr.dataset.open); });

views.pipeline = async (el) => {
  const all = (await api('listProspects')).prospects;
  const paint = () => {
    const list = all.filter((p) => !stageFilter || p.stage === stageFilter);
    for (const id of marked) if (!all.some((p) => p.id === id)) marked.delete(id);
    el.innerHTML = `<h1>Pipeline</h1>
      <div class="chips">${['', ...STAGES].map((s) => `<button class="chip${s === stageFilter ? ' on' : ''}" data-stage="${s}">${s || 'all'} ${s ? all.filter((p) => p.stage === s).length : all.length}</button>`).join('')}</div>
      <div class="card">
        <div class="row"><span class="grow soft">${marked.size} picked</span>
          <button class="btn ghost" id="bulk-draft"${marked.size ? '' : ' disabled'}>Write scripts (free)</button>
          <button class="btn red" id="bulk-make"${marked.size ? '' : ' disabled'}>Make commercials (paid)</button></div>
        ${list.length ? prospectTable(list, true) : '<p class="empty">Nothing here. Pick businesses under Find prospects.</p>'}
      </div>`;
    on(el, '[data-stage]', (b) => { stageFilter = b.dataset.stage; paint(); });
    on(el, '[data-mark]', (c) => { if (c.checked) marked.add(c.dataset.mark); else marked.delete(c.dataset.mark); paint(); }, 'change');
    wireRows(el);
    const bulk = async (btn, type) => {
      const ids = [...marked];
      if (type === 'produce' && !confirm(`Make ${ids.length} commercial${ids.length === 1 ? '' : 's'}? The voice is paid: about 1 to 2 cents each.`)) return;
      btn.disabled = true;
      let ok = 0, why = '';
      for (const id of ids) {
        try { await api('queueJob', { type, id, paid: type === 'produce', confirmPaid: type === 'produce' }); ok++; marked.delete(id); }
        catch (e) { why = errText(e); }
      }
      toast(`${ok} queued${why ? `, ${ids.length - ok} not: ${why}` : ''}`, !!why);
      paint();
    };
    $('#bulk-draft', el).onclick = (e) => bulk(e.target, 'draft');
    $('#bulk-make', el).onclick = (e) => bulk(e.target, 'produce');
  };
  paint();
};

// ---------------------------------------------------------------- outreach
views.outreach = async (el) => {
  const all = (await api('listProspects')).prospects;
  const due = all.filter((p) => p.stage === 'contacted' && p.nextTouchAt && p.nextTouchAt <= Date.now()).sort((a, b) => a.nextTouchAt - b.nextTouchAt);
  const ready = all.filter((p) => p.stage === 'ready' && !p.unsubscribed);
  const waiting = all.filter((p) => p.stage === 'contacted' && !(p.nextTouchAt && p.nextTouchAt <= Date.now())).sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0));
  const block = (title, list, none) => `<div class="card"><h2>${title} (${list.length})</h2>${list.length ? prospectTable(list) : `<p class="empty">${none}</p>`}</div>`;
  el.innerHTML = `<h1>Outreach</h1><p class="soft">Nothing is ever sent by itself. Open a business to read and send its next note. Notes go on day 0, 3, 7 and 13; the introductory price starts with the first one.</p>
    ${block('Follow-ups due', due, 'Nothing due.')}${block('Ready for the first contact', ready, 'No finished commercials waiting.')}${block('Waiting', waiting, 'Nobody is waiting.')}`;
  wireRows(el);
};

// ---------------------------------------------------------------- one business
const drawer = $('#drawer');
let player = null;
drawer.addEventListener('close', () => { player?.pause(); document.body.appendChild($('#toast')); draw(false); });
drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); });
async function openProspect(id) {
  $('#drawer-body').innerHTML = '<p class="empty">Loading…</p>';
  if (!drawer.open) drawer.showModal();
  await paintProspect(id);
}
async function paintProspect(id) {
  const body = $('#drawer-body');
  let d;
  player?.pause();
  try { d = await api('getProspect', { id }); }
  catch (e) { body.innerHTML = `<p>${esc(errText(e))}</p>`; return; }
  const p = d.prospect, o = d.offer, mail = d.nextEmail, busy = d.jobs.find((j) => j.status === 'queued' || j.status === 'running'), last = d.jobs[0];
  const sentences = (p.sentences || []).join('\n');
  const stopped = ['replied', 'won', 'lost', 'skip'].includes(p.stage) || p.unsubscribed;
  const field = (name, label, value, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}"></label>`;
  body.innerHTML = `
    <div class="dhead"><div><h1>${esc(p.business)}</h1>
      <span class="small soft"><a href="https://${esc(p.domain)}" target="_blank" rel="noopener noreferrer">${esc(p.domain)}</a> · ${esc([p.city, p.state].filter(Boolean).join(', '))}${p.reviews ? ` · ${p.reviews} reviews` : ''}</span></div>
      <button class="btn ghost" data-close>Close</button></div>

    <div class="card"><h2>Commercial</h2>
      ${busy ? `<p class="warn">${busy.type === 'draft' ? 'Writing the script' : 'Making the commercial'}: ${esc(busy.status)}. <button class="link" data-reload>Check again</button></p>` : ''}
      ${!busy && last && last.status === 'failed' ? `<p class="warn">Last job failed: ${esc(last.error)}${/pronounce|SKIPPED/i.test(last.error || '') ? '<br><label class="check"><input type="checkbox" id="force"> Make it anyway despite the name check</label>' : ''}</p>` : ''}
      ${p.canMake ? `
        <label>Script, one sentence per line (the last one should say the phone number and website)
          <textarea id="script" rows="7" placeholder="Press “Write script” and it appears here to read and edit.">${esc(sentences)}</textarea></label>
        <div class="row" style="margin:10px 0">
          <button class="btn ghost" data-job="draft"${busy ? ' disabled' : ''}>${sentences ? 'Write a new script (free)' : 'Write script (free)'}</button>
          <button class="btn red" data-job="produce"${busy ? ' disabled' : ''}>${p.composite ? 'Remake commercial (paid)' : 'Make commercial (paid)'}</button>
        </div>
        ${p.composite ? '<div class="row small"><label class="check"><input type="checkbox" data-redo="voice"> Record the voice again</label><label class="check"><input type="checkbox" data-redo="music"> Mix the music again</label></div>' : ''}`
        : '<p class="soft">The factory can\'t make one for this business: no usable logo on file.</p>'}
      ${web(p.composite) ? `<div class="preview${(o?.videos || []).some((v) => v.shape === 'tall' && p.composite.endsWith(v.composite)) ? ' tall' : ''}" id="player"></div>
        <p class="row small"><a href="${esc(p.composite)}" target="_blank" rel="noopener">Open the preview</a>
        ${p.projectId ? `<a href="${EDITOR}${encodeURIComponent(p.projectId)}" target="_blank" rel="noopener">Edit in the video editor</a>` : ''}
        ${p.slug ? `<a href="${pageUrl(p.slug)}" target="_blank" rel="noopener">Their page</a>` : ''}
        ${o ? `<span class="soft">${o.views || 0} visit${o.views === 1 ? '' : 's'}${o.offerStart ? `, offer started ${esc(o.offerStart)}` : ', offer not started'}</span>` : ''}</p>` : ''}
    </div>

    <div class="card"><h2>Details</h2>
      <form id="details">
        <div class="grid">
          ${field('business', 'Name (as said and shown)', p.business)}${field('phone', 'Phone', p.phone)}${field('email', 'Email', p.email, 'email')}
          ${field('city', 'City', p.city)}${field('state', 'State', p.state)}${field('contactForm', 'Contact form address', p.contactForm)}
          <label>Brand colour<input name="color" type="color" value="${esc(p.color || '#b51417')}"${p.color ? ' data-had="1"' : ''}></label>
          <label>Stage<select name="stage">${STAGES.map((s) => `<option${s === p.stage ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
        </div>
        <label style="margin-top:10px">Notes<textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>
        <div class="row" style="margin-top:10px"><button class="btn">Save</button>${(p.touches || []).length ? '' : '<button type="button" class="link" data-remove>Remove from pipeline</button>'}</div>
        <p class="small soft">Name, phone and colour take effect the next time the commercial is made.</p>
      </form>
    </div>

    <div class="card"><h2>Outreach</h2>
      ${p.unsubscribed ? '<p class="warn">They unsubscribed. Don\'t contact them again.</p>' : ''}
      ${(p.touches || []).length ? `<ul class="small">${p.touches.map((t) => `<li>Note ${t.n + 1} by ${esc(t.how)}, ${when(t.at)}${t.subject ? `: ${esc(t.subject)}` : ''}</li>`).join('')}</ul>` : ''}
      ${stopped ? '<p class="soft">Follow-ups are stopped.</p>' : !mail ? '<p class="soft">All four notes are done.</p>' : !p.slug ? '<p class="soft">Make the commercial first, so there is a page to send.</p>' : `
        <p class="small soft">Note ${mail.n + 1} of 4${p.nextTouchAt ? `, due ${when(p.nextTouchAt)}` : ''}. Read it before it goes.</p>
        <label>Subject<input id="subject" value="${esc(mail.subject)}"></label>
        <label style="margin-top:8px">Message<textarea id="message" rows="9">${esc(mail.body)}</textarea></label>
        <div class="row" style="margin-top:10px">
          <button class="btn red" data-send${p.email ? '' : ' disabled'}>Send email</button>
          <button class="btn ghost" data-copy>Copy message</button>
          ${web(p.contactForm) ? `<a class="btn ghost" href="${esc(p.contactForm)}" target="_blank" rel="noopener noreferrer">Open their contact form</a>` : ''}
          <button class="link" data-log="form">I sent it through the form</button>
          <button class="link" data-log="phone">I called</button>
          <button class="link" data-log="email">I emailed it myself</button>
        </div>`}
    </div>

    ${d.jobs.length ? `<div class="card"><h2>Factory history</h2>${d.jobs.slice(0, 5).map((j) => `<details><summary>${tag(j.status)} ${esc(j.type)} · ${when(j.createdAt)}</summary><pre>${esc(j.log || j.error || 'No log yet.')}</pre></details>`).join('')}</div>` : ''}`;

  const again = () => paintProspect(id);
  const token = (String(p.composite || '').match(/[?&]c=([A-Za-z0-9_-]+)/) || [])[1];
  if (token) player = window.PWPlayer.mount($('#player', body), token);
  $('[data-close]', body).onclick = () => drawer.close();
  on(body, '[data-reload]', again);
  const details = () => {
    const f = $('#details', body), patch = {};
    for (const k of ['business', 'phone', 'email', 'city', 'state', 'contactForm', 'notes']) patch[k] = f.elements[k].value;
    const c = f.elements.color;
    if (c.dataset.had || c.value !== '#b51417') patch.color = c.value;
    if (f.elements.stage.value !== p.stage) patch.stage = f.elements.stage.value;
    return patch;
  };
  $('#details', body).onsubmit = (e) => { e.preventDefault(); act($('button', e.target), () => api('saveProspect', { id, patch: details() }), 'Saved.').then((r) => r && again()); };
  on(body, '[data-remove]', (b) => confirm(`Remove ${p.business} from the pipeline?`) && act(b, () => api('removeProspect', { id }), 'Removed.').then((r) => r && drawer.close()));
  on(body, '[data-job]', (b) => {
    const type = b.dataset.job;
    if (type === 'produce' && !confirm('Make this commercial? The voice is paid: about 1 to 2 cents. Lines already recorded are not paid for again.')) return;
    if (type === 'draft' && sentences && !confirm('Replace the script with a new one?')) return;
    const text = $('#script', body).value.split('\n').map((s) => s.trim()).filter(Boolean);
    act(b, async () => {
      await api('saveProspect', { id, patch: details() });
      return api('queueJob', {
        type, id, paid: type === 'produce', confirmPaid: type === 'produce',
        sentences: type === 'produce' && text.join('\n') !== sentences ? text : undefined,
        redo: type === 'draft' ? (sentences ? ['script'] : []) : $$('[data-redo]:checked', body).map((c) => c.dataset.redo),
        forceName: !!$('#force', body)?.checked
      });
    }, 'Queued. The factory PC picks it up within half a minute.').then((r) => r && again());
  });
  on(body, '[data-send]', (b) => confirm(`Send this email to ${p.email}?`) && act(b, () => api('sendEmail', { id, subject: $('#subject', body).value, body: $('#message', body).value }), 'Sent.').then((r) => r && again()));
  on(body, '[data-copy]', () => navigator.clipboard.writeText($('#message', body).value).then(() => toast('Copied.'), () => toast('Couldn\'t copy.', true)));
  on(body, '[data-log]', (b) => confirm(`Record that you contacted them (${b.dataset.log})?`) && act(b, () => api('logTouch', { id, how: b.dataset.log }), 'Recorded.').then((r) => r && again()));
}

// ---------------------------------------------------------------- lead data
const STEPS = [['website', 'Website reading'], ['summary', 'Website summaries'], ['contact', 'Contact search'], ['logo', 'Logo check'], ['name', 'Name check']];
const tradeName = (t) => { const s = String(t || 'other').replace(/^winter:/, '').replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
views.leads = async (el) => {
  const { leads: d } = await api('leadStats');
  if (!d) { el.innerHTML = '<h1>Lead data</h1><div class="card"><p class="empty">The factory PC hasn't reported yet.</p></div>'; return; }
  const n = (v) => Number(v || 0).toLocaleString('en-US');
  const sum = (k) => d.trades.reduce((a, t) => a + Number(t[k] || 0), 0);
  const rows = (list) => list.map(([k, label]) => `<tr><td>${label}</td>${d.trades.map((t) => `<td>${n(t[k])}</td>`).join('')}<td><b>${n(sum(k))}</b></td></tr>`).join('');
  const table = (title, list) => `<div class="card"><h2>${title}</h2><div class="scroll"><table><thead><tr><th></th>${d.trades.map((t) => `<th>${esc(tradeName(t.trade))}</th>`).join('')}<th>All</th></tr></thead><tbody>${rows(list)}</tbody></table></div></div>`;
  const waits = { website: 'notRead', summary: 'waitingSummary', contact: 'waitingContact', logo: 'waitingLogo', name: 'waitingName' };
  el.innerHTML = `<h1>Lead data</h1>
    <p class="soft">Single-location businesses. The factory PC works through what is waiting every hour, a limited batch at a time, at no cost. Pausing the factory pauses this too.</p>
    ${(d.notes || []).map((x) => `<p class="warn">${esc(x)}</p>`).join('')}
    <div class="card"><div class="row"><div class="grow"><b>${d.running ? `Working now: ${esc((STEPS.find((s) => s[0] === d.running) || [0, d.running])[1])}` : 'Waiting for the next run'}</b><br>
      <span class="small soft">Updated ${when(d.at)} · ${n(d.freeMB)} MB of disk free on the PC</span></div><button class="btn ghost" id="reload">Refresh</button></div>
      <div class="scroll"><table><thead><tr><th>Step</th><th>Waiting</th><th>Done today</th><th>Daily limit</th><th>Last run</th></tr></thead><tbody>
      ${STEPS.map(([k, label]) => { const s = (d.stages || {})[k]; return `<tr><td>${label}</td><td>${n(sum(waits[k]))}</td><td>${n((d.today || {})[k])}</td><td>${n(d.caps[k].day)}</td><td class="small">${s ? `${esc(s.text)}<br><span class="soft">${when(s.at)}</span>` : 'not run yet'}</td></tr>`; }).join('')}
      </tbody></table></div><p class="small soft">"Done today" counts what each run was given to work on.</p></div>
    ${table('Ready to make a commercial', [['ready', 'Logo works'], ['goodName', 'and the name is fine to say'], ['riskyName', 'name flagged as risky'], ['waitingName', 'name not checked yet'], ['readyEmail', 'Has an email'], ['readyForm', 'No email, contact page or form'], ['best', 'Fine name and an email']])}
    ${table('How far each business has got', [['total', 'Total'], ['notRead', 'Website not read yet'], ['waitingSummary', 'Waiting to be summarised'], ['summarised', 'Summarised'], ['unreachable', 'Website didn't load'], ['noText', 'Website had almost no text'], ['waitingContact', 'Waiting for the contact search']])}`;
  $('#reload', el).onclick = () => draw(false);
};

// ---------------------------------------------------------------- factory
const openLogs = new Set();
views.factory = async (el) => {
  const [d, s] = await Promise.all([api('listJobs'), api('getSettings')]);
  const w = d.worker, up = workerState(w), paused = s.settings.paused;
  el.innerHTML = `<h1>Factory</h1>
    <div class="card"><div class="row">
      <div class="grow"><b>${!up ? 'The factory PC is offline' : w.current ? `Working on: ${esc(w.current.label || w.current.type)}` : 'The factory PC is ready'}</b><br>
        <span class="small soft">${w ? `Last check-in ${when(w.at)}` : 'It has never checked in.'}${w && w.pool ? ` · pool of ${w.pool.n.toLocaleString()} built ${when(w.pool.at)}` : ''}${w && w.spend ? ` · $${Number(w.spend.usd).toFixed(2)} of $${w.spend.cap} Gemini budget used` : ''}</span></div>
      <button class="btn ${paused ? 'red' : 'ghost'}" id="pause">${paused ? 'Resume the factory' : 'Pause the factory'}</button>
      <button class="btn ghost" id="reload">Refresh</button></div></div>
    <div class="card"><h2>Jobs</h2>
      ${d.jobs.length ? d.jobs.map((j) => `<details data-log="${esc(j.id)}"${openLogs.has(j.id) ? ' open' : ''}>
        <summary>${tag(j.status)} <b>${esc(j.label || j.type)}</b> <span class="small soft">${esc(j.type)}${j.paid ? ', paid' : ''} · ${when(j.createdAt)}</span>
        ${j.status === 'queued' ? ` <button class="link" data-cancel="${esc(j.id)}">Cancel</button>` : ''}</summary>
        ${j.error ? `<p class="warn">${esc(j.error)}</p>` : ''}${j.result && web(j.result.url) ? `<p><a href="${esc(j.result.url)}" target="_blank" rel="noopener">Download the MP4</a></p>` : ''}
        <pre>${esc(j.log || 'No log yet.')}</pre>
        ${j.prospectId ? `<button class="link" data-open="${esc(j.prospectId)}">Open this business</button>` : ''}</details>`).join('') : '<p class="empty">No jobs yet.</p>'}
    </div>`;
  on(el, 'details[data-log]', (x) => { if (x.open) openLogs.add(x.dataset.log); else openLogs.delete(x.dataset.log); }, 'toggle');
  on(el, '[data-cancel]', (b, e) => { e.preventDefault(); act(b, () => api('cancelJob', { id: b.dataset.cancel }), 'Cancelled.').then(() => draw(false)); });
  on(el, '[data-open]', (b) => openProspect(b.dataset.open));
  $('#reload', el).onclick = () => draw(false);
  $('#pause', el).onclick = (e) => act(e.target, () => api('saveSettings', { patch: { paused: !paused } })).then(() => draw(false));
  // keep an eye on running work, only while this page is open and in front
  clearTimeout(timer);
  if (d.jobs.some((j) => j.status === 'queued' || j.status === 'running')) {
    const tick = () => { timer = setTimeout(() => { if (view !== 'factory') return; if (document.hidden || drawer.open) tick(); else draw(false); }, 20000); };
    tick();
  }
};

// ---------------------------------------------------------------- client pages
views.pages = async (el) => {
  const { pages } = await api('listPages');
  el.innerHTML = `<h1>Client pages</h1><div class="card">${pages.length ? `<div class="scroll"><table><thead><tr><th>Page</th><th>Videos</th><th>Sold</th><th>Visits</th><th>Offer began</th><th></th></tr></thead><tbody>
    ${pages.map((p) => `<tr><td><b>${esc(p.business)}</b><br><a class="small soft" href="${pageUrl(p.slug)}" target="_blank" rel="noopener">/${esc(p.slug)}</a> ${p.off ? tag('off') : ''}</td>
      <td>${p.videos}</td><td>${p.sold || ''}</td><td>${p.views || ''}${p.lastViewedAt ? `<br><span class="small soft">${when(p.lastViewedAt)}</span>` : ''}</td><td>${esc(p.offerStart || 'not yet')}</td>
      <td><button class="btn ghost" data-page="${esc(p.slug)}">Manage</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No client pages yet. The factory makes one with each commercial.</p>'}</div>`;
  on(el, '[data-page]', (b) => openPage(b.dataset.page));
};
async function openPage(slug) {
  const body = $('#drawer-body');
  body.innerHTML = '<p class="empty">Loading…</p>';
  if (!drawer.open) drawer.showModal();
  let d;
  try { d = await api('getPage', { slug }); }
  catch (e) { body.innerHTML = `<p>${esc(errText(e))}</p>`; return; }
  const o = d.page;
  let videos = (o.videos || []).map((v) => ({ ...v }));
  body.innerHTML = `<div class="dhead"><div><h1>${esc(o.business)}</h1><a class="small soft" href="${pageUrl(slug)}" target="_blank" rel="noopener">/${esc(slug)}</a></div><button class="btn ghost" data-close>Close</button></div>
    <div class="card"><div class="grid">
      <label>Business name<input id="p-biz" value="${esc(o.business)}"></label>
      <label>Offer began (empty = not started)<input id="p-start" type="date" value="${esc(o.offerStart || '')}"></label>
      <label>Offer length in days<input id="p-days" type="number" min="1" max="60" value="${o.offerDays || 14}"></label></div>
      <label class="check" style="margin-top:10px"><input id="p-off" type="checkbox"${o.off ? ' checked' : ''}> Switch this page off (visitors see “not found”)</label></div>
    <div class="card"><h2>Videos</h2><div id="p-videos"></div></div>
    <button class="btn red" id="p-save">Save page</button>`;
  const list = () => {
    $('#p-videos', body).innerHTML = videos.length ? videos.map((v, i) => `<div class="row" style="margin-bottom:10px">
      <input class="grow" style="flex:1 1 220px;width:auto" data-title="${i}" value="${esc(v.title)}" aria-label="Title">
      ${tag(v.shape === 'tall' ? 'vertical' : 'widescreen')}${(o.paid || {})[v.id] ? tag('sold') : ''}
      <button class="link" data-up="${i}"${i ? '' : ' disabled'}>Up</button>
      ${v.projectId ? `<a class="small" href="${EDITOR}${encodeURIComponent(v.projectId)}" target="_blank" rel="noopener">Edit</a><button class="link" data-render="${esc(v.projectId)}">Render MP4</button>` : ''}
      ${(o.paid || {})[v.id] ? '' : `<button class="link" data-del="${i}">Remove</button>`}</div>`).join('') : '<p class="soft">No videos on this page.</p>';
    on(body, '[data-title]', (x) => { videos[x.dataset.title].title = x.value; }, 'input');
    on(body, '[data-up]', (x) => { const i = Number(x.dataset.up); [videos[i - 1], videos[i]] = [videos[i], videos[i - 1]]; list(); });
    on(body, '[data-del]', (x) => { videos.splice(Number(x.dataset.del), 1); list(); toast('Removed here. Press Save page to keep it.'); });
    on(body, '[data-render]', (x) => confirm('Render this video to an MP4 on the factory PC? It is free and takes a while.') && act(x, () => api('queueJob', { type: 'render', projectId: x.dataset.render }), 'Queued. See Factory.'));
  };
  list();
  $('[data-close]', body).onclick = () => drawer.close();
  $('#p-save', body).onclick = (e) => act(e.target, () => api('savePage', { slug, patch: { business: $('#p-biz', body).value, offerStart: $('#p-start', body).value, offerDays: $('#p-days', body).value, off: $('#p-off', body).checked, videos: videos.map((v) => ({ id: v.id, title: v.title })) } }), 'Saved.');
}

// ---------------------------------------------------------------- orders
views.orders = async (el) => {
  const { orders } = await api('listOrders');
  el.innerHTML = `<h1>Orders</h1>${orders.length ? orders.map((o) => `<div class="card" data-order="${esc(o.id)}">
    <div class="row"><div class="grow"><b>${esc(o.business)}</b> ${tag(o.status)}<br><span class="small soft">${money(o.amount)} · ${when(o.createdAt)} · ${esc(o.email || 'no email')}</span></div></div>
    ${(o.videos || []).map((v) => `<div class="row end" style="margin-top:10px">
      <label class="grow">${esc(v.title)} (${v.shape === 'tall' ? 'vertical' : 'widescreen'}) download link<input data-file="${esc(v.id)}" value="${esc((o.files || {})[v.id] || '')}" placeholder="Filled in when the render finishes"></label>
      <button class="btn ghost" data-render="${esc(v.id)}">Render</button></div>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-save>Save links</button><button class="btn red" data-deliver>${o.status === 'delivered' ? 'Email the links again' : 'Email the buyer'}</button></div></div>`).join('')
    : '<div class="card"><p class="empty">No orders yet.</p></div>'}`;
  for (const card of $$('[data-order]', el)) {
    const o = orders.find((x) => x.id === card.dataset.order);
    const files = () => Object.fromEntries($$('[data-file]', card).map((i) => [i.dataset.file, i.value.trim()]));
    $('[data-save]', card).onclick = (e) => act(e.target, () => api('saveOrder', { id: o.id, files: files() }), 'Saved.');
    $('[data-deliver]', card).onclick = (e) => confirm(`Email the download links to ${o.email}?`) && act(e.target, async () => { await api('saveOrder', { id: o.id, files: files() }); return api('deliverOrder', { id: o.id }); }, 'Sent.').then((r) => r && draw(false));
    on(card, '[data-render]', (b) => act(b, async () => {
      const v = (await api('getPage', { slug: o.token })).page.videos.find((x) => x.id === b.dataset.render);
      if (!v || !v.projectId) throw new Error('That video is no longer on their page, so render it from the video editor.');
      return api('queueJob', { type: 'render', projectId: v.projectId, orderId: o.id, videoId: v.id });
    }, 'Queued. The link appears here when it is done.'));
  }
};

// ---------------------------------------------------------------- messages
views.inbox = async (el) => {
  const { inquiries } = await api('listInquiries');
  el.innerHTML = `<h1>Messages</h1><p class="soft">From the contact form on pocketwatch.studio. Each one is also emailed to you.</p>
    ${inquiries.length ? inquiries.map((m) => `<div class="card"><div class="row"><div class="grow"><b>${esc(m.name)}</b>${m.business ? `, ${esc(m.business)}` : ''}<br>
      <span class="small soft"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.phone ? ` · ${esc(m.phone)}` : ''} · ${when(m.createdAt)}</span></div>
      <button class="btn ghost" data-done="${esc(m.id)}" data-now="${m.done ? 1 : ''}">${m.done ? 'Answered (undo)' : 'Mark answered'}</button></div>
      <p style="white-space:pre-wrap">${esc(m.message)}</p></div>`).join('') : '<div class="card"><p class="empty">No messages yet.</p></div>'}`;
  on(el, '[data-done]', (b) => act(b, () => api('saveInquiry', { id: b.dataset.done, done: !b.dataset.now })).then(() => draw(false)));
};

// ---------------------------------------------------------------- settings
views.settings = async (el) => {
  const s = (await api('getSettings')).settings;
  const check = (k, label) => `<label class="check"><input type="checkbox" name="${k}"${s[k] ? ' checked' : ''}> ${label}</label>`;
  const num = (name, label, v, step = 1) => `<label>${label}<input type="number" name="${name}" value="${v}" min="0" step="${step}"></label>`;
  el.innerHTML = `<h1>Settings</h1><form id="settings">
    <div class="card"><h2>Factory</h2>${check('paused', 'Pause the factory')}${check('paidAllowed', 'Allow paid steps (each one still asks you first)')}
      <div class="grid" style="margin-top:10px">${num('dailyJobCap', 'Jobs a day at most', s.dailyJobCap)}${num('dailyPaidCap', 'Paid jobs a day at most', s.dailyPaidCap)}</div></div>
    <div class="card"><h2>Pitch email</h2>
      <p class="warn">Emails go from ProfilePilot's Gmail account for now. Cold email is safer from a separate domain with SPF, DKIM and DMARC set up, so leave sending off until you're happy with that.</p>
      ${check('sendingEnabled', 'Allow sending from this panel')}
      <div class="grid" style="margin-top:10px"><label>Sender name<input name="senderName" value="${esc(s.senderName)}"></label>
        <label>Your mailing address (goes in every pitch)<input name="mailingAddress" value="${esc(s.mailingAddress)}"></label>${num('dailyEmailCap', 'Pitch emails a day at most (50 max)', s.dailyEmailCap)}</div></div>
    <div class="card"><h2>Prices on client pages</h2><div class="grid">
      ${num('os', 'Introductory, one video ($)', s.prices.offer.single, 0.01)}${num('op', 'Introductory, the set ($)', s.prices.offer.pkg, 0.01)}
      ${num('rs', 'Regular, one video ($)', s.prices.regular.single, 0.01)}${num('rp', 'Regular, the set ($)', s.prices.regular.pkg, 0.01)}
      ${num('offerDays', 'Introductory price lasts (days)', s.offerDays)}</div></div>
    <div class="card"><h2>The four notes</h2><p class="small soft">You can use {business}, {city}, {link} and {offer_end}. Day 0, 3, 7 and 13.</p>
      ${s.templates.map((t, i) => `<label style="margin-top:10px">Note ${i + 1} subject<input data-subject="${i}" value="${esc(t.subject)}"></label><label style="margin-top:6px">Note ${i + 1} message<textarea data-body="${i}" rows="6">${esc(t.body)}</textarea></label>`).join('')}</div>
    <button class="btn red">Save settings</button></form>`;
  $('#settings', el).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const patch = {
      paused: f.paused.checked, paidAllowed: f.paidAllowed.checked, sendingEnabled: f.sendingEnabled.checked,
      senderName: f.senderName.value, mailingAddress: f.mailingAddress.value,
      dailyJobCap: f.dailyJobCap.value, dailyPaidCap: f.dailyPaidCap.value, dailyEmailCap: f.dailyEmailCap.value, offerDays: f.offerDays.value,
      prices: { offer: { single: f.os.value, pkg: f.op.value }, regular: { single: f.rs.value, pkg: f.rp.value } },
      templates: s.templates.map((_, i) => ({ subject: $(`[data-subject="${i}"]`, el).value, body: $(`[data-body="${i}"]`, el).value }))
    };
    act($('button', e.target), () => api('saveSettings', { patch }), 'Settings saved.');
  };
};
