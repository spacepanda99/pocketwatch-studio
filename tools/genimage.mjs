// One image from Gemini (Nano Banana Pro by default). PAID: only run when the user asked for it.
//   node tools/genimage.mjs <outName> <promptFile> [aspect=4:5] [model=gemini-3-pro-image]
// Saves the image + the full raw response (minus the image bytes) + the prompt in tools/images/,
// and books an estimated cost in the shared Gemini ledger (C:/Mikes Stuff/gemini-tools/ledger.json).
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [name, promptFile, aspect = '4:5', model = 'gemini-3-pro-image'] = process.argv.slice(2);
if (!name || !promptFile) { console.log('usage: node tools/genimage.mjs <name> <promptFile> [aspect] [model]'); process.exit(1); }
const key = fs.readFileSync('C:/Mikes Stuff/Gemini api2.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => /^AQ\./.test(s));
// $ per 1M tokens, from memory (Nov 2026), so the ledger entry is an ESTIMATE: input text, output image tokens.
const PRICE = { 'gemini-3-pro-image': { in: 2, out: 120 }, 'gemini-3.1-flash-image': { in: 0.5, out: 60 } }[model];
if (!PRICE) { console.log('No price on file for ' + model + '; add it first.'); process.exit(1); }
const prompt = fs.readFileSync(promptFile, 'utf8').trim();
const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
});
const txt = await r.text();
if (!r.ok) { console.log('HTTP ' + r.status + ': ' + txt.split(key).join('[key]').slice(0, 500)); process.exit(1); }
const j = JSON.parse(txt);
const parts = j.candidates?.[0]?.content?.parts || [];
const img = parts.find(p => p.inlineData || p.inline_data);
const out = path.join(root, 'tools', 'images'); fs.mkdirSync(out, { recursive: true });
const tag = `${name}-${Date.now()}`;
if (img) { const d = img.inlineData || img.inline_data; const ext = /png/.test(d.mimeType || d.mime_type) ? 'png' : 'jpg'; fs.writeFileSync(path.join(out, `${tag}.${ext}`), Buffer.from(d.data, 'base64')); d.data = `[${d.data.length} base64 chars saved as ${tag}.${ext}]`; console.log('saved tools/images/' + tag + '.' + ext); }
else console.log('No image in the response. finishReason: ' + j.candidates?.[0]?.finishReason);
fs.writeFileSync(path.join(out, tag + '.raw.json'), JSON.stringify(j, null, 1));
fs.writeFileSync(path.join(out, tag + '.prompt.txt'), prompt + `\n\n[${model}, ${aspect}]\n`);
const u = j.usageMetadata || {}; const cost = ((u.promptTokenCount || 0) * PRICE.in + (u.candidatesTokenCount || 0) * PRICE.out) / 1e6;
console.log(`tokens in ${u.promptTokenCount} out ${u.candidatesTokenCount}, estimated cost $${cost.toFixed(4)}`);
const LEDGER = 'C:/Mikes Stuff/gemini-tools/ledger.json';
const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
l.entries.push({ t: new Date().toISOString().slice(0, 16), model, inTokens: u.promptTokenCount || 0, outTokens: u.candidatesTokenCount || 0, costUsd: cost, note: `pocketwatch: ${name} image (estimated price)` });
fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
