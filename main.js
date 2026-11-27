// Pocket Watch Studio: the contact form and the footer year.
// FORM_ENDPOINT is where messages get sent: the pwContact function (see README.md, "Contact form").
const FORM_ENDPOINT = 'https://us-central1-skillsprouts-f2787.cloudfunctions.net/pwContact';

document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('contact-form');
const status = form.querySelector('.status');
const say = (text, kind) => { status.textContent = text; status.className = 'status' + (kind ? ' ' + kind : ''); };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.querySelectorAll('input, textarea').forEach((el) => el.classList.add('touched'));
  if (!form.checkValidity()) { say('Please fill in your name, business, email and a short message.', 'err'); return; }
  const data = Object.fromEntries(new FormData(form));
  if (data.website) { say('Thanks! We got your message.', 'ok'); form.reset(); return; }   // a bot filled the hidden field
  delete data.website;
  if (!FORM_ENDPOINT) { say('Sorry, this form isn\'t connected yet. Please check back soon.', 'err'); return; }
  const btn = form.querySelector('button'); btn.disabled = true; say('Sending…');
  try {
    const r = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    form.reset(); form.querySelectorAll('.touched').forEach((el) => el.classList.remove('touched'));
    say('Thanks! We got your message and will be in touch soon.', 'ok');
  } catch (err) {
    say('Sorry, that didn\'t send. Please try again in a minute.', 'err');
  } finally { btn.disabled = false; }
});
