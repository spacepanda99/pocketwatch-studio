// The composite player: plays a commercial as LAYERS, the same way the editor's preview and ProfilePilot's /ad page do
// (the picture clips, the voice and music, and the motion graphics drawn over it in sandboxed frames). Nothing is
// rendered to an MP4 until someone buys it. A commercial is published with ProfilePilot's video-editor/share.mjs,
// which writes adPreviews/<token>/project.json to Firebase Storage (public, CORS-open); put that token in the video's
// "composite" field. Keep overlayDoc() the same as ProfilePilot's js/ad-player.js and js/video-editor.js.
//
//   const p = PWPlayer.mount(stageElement, token)   -> builds the player inside the element; only one plays at a time.
(function () {
  const BUCKET = 'skillsprouts-f2787.firebasestorage.app';
  const vlen = (c) => Math.max(0.1, (c.out ?? c.duration) - (c.in || 0));
  const fmt = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const all = [];

  function mount(el, token) {
    el.classList.add('cp');
    el.innerHTML = `<div class="cp-stage"><video playsinline preload="metadata" disablepictureinpicture muted></video><div class="cp-ov"></div>
        <button type="button" class="cp-big" aria-label="Play"><span></span></button><span class="cp-len"></span></div>
      <div class="cp-bar"><button type="button" class="cp-pp" aria-label="Play">&#9654;</button>
        <input type="range" class="cp-scrub" min="0" max="0" step="0.05" value="0" aria-label="Position"><span class="cp-t">0:00</span></div>`;
    const q = (s) => el.querySelector(s), video = q('video'), ovBox = q('.cp-ov'), scrub = q('.cp-scrub');
    let project = null, playing = false, t = 0, curIdx = -1, lastWall = 0, started = false;
    const audioEls = new Map(), overlayEls = new Map();

    function layout() {
      let x = 0;
      for (const c of project.video) { c._start = x; x += c.status === 'pending' ? 0 : vlen(c); }
      const ends = [x, ...project.audio.map((a) => (a.start || 0) + vlen(a)), ...project.overlays.map((o) => (o.start || 0) + (o.duration || 0))];
      project._total = Math.max(0.1, ...ends);
      scrub.max = String(project._total);
      q('.cp-len').textContent = fmt(project._total);
    }
    function clipIndexAt(time) {
      for (let i = 0; i < project.video.length; i++) { const c = project.video[i]; if (c.status === 'pending' || !c.src) continue; if (time < c._start + vlen(c) - 0.001) return i; }
      return -1;
    }
    function showClip(idx, time) {
      const c = project.video[idx];
      if (!c) { video.removeAttribute('src'); video.load(); curIdx = -1; return; }
      const local = (c.in || 0) + Math.max(0, time - c._start);
      if (curIdx !== idx || video.dataset.src !== c.src) {
        curIdx = idx; video.dataset.src = c.src; video.src = c.src;
        video.addEventListener('loadedmetadata', () => { video.currentTime = local; if (playing) video.play().catch(() => {}); }, { once: true });
      } else if (Math.abs(video.currentTime - local) > 0.25) video.currentTime = local;
      video.volume = Math.min(1, Math.max(0, c.volume ?? 1)); video.muted = !started || !!c.muted;
      if (playing && video.paused) video.play().catch(() => {});
      if (!playing && !video.paused) video.pause();
    }
    function syncAudio(time) {
      if (!started) return;
      for (const a of project.audio) {
        if (!a.src || a.status === 'pending') continue;
        let au = audioEls.get(a.id);
        if (!au) { au = new Audio(); au.preload = 'auto'; au.src = a.src; audioEls.set(a.id, au); }
        au.volume = Math.min(1, Math.max(0, a.volume ?? 1));
        const inRange = time >= (a.start || 0) && time < (a.start || 0) + vlen(a), want = (a.in || 0) + (time - (a.start || 0));
        if (playing && inRange) { if (Math.abs(au.currentTime - want) > 0.35) au.currentTime = want; if (au.paused) au.play().catch(() => {}); }
        else { if (!au.paused) au.pause(); if (inRange) au.currentTime = want; }
      }
    }
    function overlayDoc(o) {
      const ad = JSON.stringify(project.business || {}).replace(/</g, '\\u003c');
      return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}</style>
<script>window.AD=${ad};<\/script></head><body>${o.html || ''}
<script>(function(){function set(t){try{if(typeof window.__seek==="function")window.__seek(t)}catch(e){}
try{document.getAnimations().forEach(function(a){a.pause();a.currentTime=t*1000})}catch(e){}}
window.addEventListener("message",function(e){if(e.data&&typeof e.data.__t==="number")set(e.data.__t)});set(0);})();<\/script></body></html>`;
    }
    function syncOverlays(time) {
      for (const o of project.overlays) {
        let f = overlayEls.get(o.id);
        const on = time >= (o.start || 0) && time < (o.start || 0) + (o.duration || 0);
        if (!f && !on) continue;                     // frames are made the first time they're needed (8 players on one page)
        if (!f) { f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('title', o.label || 'Graphic'); f.setAttribute('tabindex', '-1'); f.srcdoc = overlayDoc(o); ovBox.appendChild(f); overlayEls.set(o.id, f); f.addEventListener('load', () => sync(false)); }
        f.style.display = on ? 'block' : 'none';
        if (on && f.contentWindow) f.contentWindow.postMessage({ __t: time - (o.start || 0) }, '*');
      }
    }
    function sync(force) {
      if (!project) return;
      const idx = clipIndexAt(t);
      if (idx >= 0) showClip(idx, t); else if (force || curIdx !== -1) { if (!video.paused) video.pause(); curIdx = -1; }
      syncAudio(t); syncOverlays(t);
      scrub.value = String(t);
      q('.cp-t').textContent = `${fmt(t)} / ${fmt(project._total)}`;
    }
    function tick(now) {
      requestAnimationFrame(tick);
      const dt = lastWall ? (now - lastWall) / 1000 : 0; lastWall = now;
      if (!project || !playing) return;
      const c = project.video[curIdx];
      if (c && curIdx === clipIndexAt(t) && !video.paused && video.readyState >= 2) {
        t = c._start + Math.max(0, video.currentTime - (c.in || 0));
        if (video.currentTime >= (c.out ?? c.duration) - 0.04 || video.ended) t = c._start + vlen(c) + 0.001;
      } else t += Math.min(dt, 0.25);
      if (t >= project._total) { t = project._total; setPlaying(false); }
      sync(false);
    }
    function setPlaying(p) {
      if (!project) return;
      if (p) { for (const other of all) if (other !== api) other.pause(); if (!started) { started = true; el.classList.add('cp-on'); } }
      playing = p;
      q('.cp-pp').innerHTML = p ? '&#10074;&#10074;' : '&#9654;';
      q('.cp-pp').setAttribute('aria-label', p ? 'Pause' : 'Play');
      el.classList.toggle('cp-playing', p);
      if (!p) { video.pause(); for (const au of audioEls.values()) au.pause(); }
      sync(true);
    }
    const toggle = () => { if (!project) return; if (!playing && t >= project._total - 0.05) t = 0; setPlaying(!playing); };
    q('.cp-big').addEventListener('click', toggle); q('.cp-pp').addEventListener('click', toggle);
    q('.cp-stage').addEventListener('click', (e) => { if (!e.target.closest('.cp-big')) toggle(); });
    scrub.addEventListener('input', () => { t = Number(scrub.value); sync(true); });
    video.addEventListener('contextmenu', (e) => e.preventDefault());

    const api = { pause: () => { if (playing) setPlaying(false); } };
    all.push(api);
    fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(`adPreviews/${token}/project.json`)}?alt=media`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then((pj) => { project = pj; layout(); el.classList.add('cp-ready'); sync(true); requestAnimationFrame(tick); })
      .catch(() => { el.classList.add('cp-fail'); q('.cp-stage').insertAdjacentHTML('beforeend', '<p class="cp-msg">This preview didn\'t load. Please refresh the page.</p>'); });
    return api;
  }
  window.PWPlayer = { mount };
})();
