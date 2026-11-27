// Writes the demo prospect page (Firestore pwOffers/demo -> /watch/?id=demo): the sample client Pocket Watch Roofing
// (fake, cloned from a real roofer, 555 phone), 4 widescreen + 4 vertical commercials. Only the first widescreen one
// has a real composite yet (ProfilePilot project vpsandboxpwr, shared with video-editor/share.mjs); the rest are
// placeholders until those commercials are made. Re-run after editing. Needs ProfilePilot's service-account key.
//   node tools/seed-demo.cjs [offerStart YYYY-MM-DD]
const PP = 'C:/Mikes Stuff/ProfilePilot/Website';
const admin = require(PP + '/functions/node_modules/firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require(PP + '/bbb-crawler/serviceAccountKey.json')) });

const start = process.argv[2] || new Date().toISOString().slice(0, 10);
const spots = ['Trusted since 1978', 'Free drone inspection', 'Our own crews', 'Storm season'];
const videos = [
  ...spots.map((title, i) => ({ id: 'w' + (i + 1), title, shape: 'wide', composite: i === 0 ? 'ZvyR-ouJikK9' : '' })),
  ...spots.map((title, i) => ({ id: 't' + (i + 1), title, shape: 'tall', composite: '' })),
];
admin.firestore().doc('pwOffers/demo').set({ business: 'Pocket Watch Roofing', logo: '', email: '', offerStart: start, offerDays: 14, videos, paid: {}, createdAt: Date.now() })
  .then(() => { console.log('pwOffers/demo written, offer starts ' + start); process.exit(0); })
  .catch((e) => { console.error(e.message); process.exit(1); });
