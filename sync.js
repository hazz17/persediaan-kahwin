// Perkongsian data dengan pasangan melalui Firebase Firestore.
// Setiap "bilik" ialah satu dokumen rooms/{KOD}. Item disimpan sebagai map ikut id
// supaya dua telefon boleh tambah/ubah item berbeza serentak tanpa saling memadam.
import config from './firebase-config.js';

const ROOMKEY = 'kahwin-room';
const COLLS = ['events', 'costs', 'savings', 'guests', 'tasks'];
const LOCAL_ONLY = ['photo']; // gambar kekal dalam telefon sahaja (saiz besar & peribadi)
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let room = null; try { room = localStorage.getItem(ROOMKEY); } catch (e) {}
let mountEl = null, status = '', busy = false;
const H = {}; // diisi oleh init() bila Firebase sedia

const fmtCode = c => c ? c.slice(0, 4) + '-' + c.slice(4) : '';
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => window.App && App.toast(m);

function view() {
  if (!mountEl || !document.body.contains(mountEl)) return;
  if (!config) {
    mountEl.innerHTML = '<div class="hint">Perkongsian belum disambungkan ke pangkalan data. Ia akan aktif selepas Firebase disediakan.</div>';
    return;
  }
  if (!room) {
    mountEl.innerHTML = `<div class="hint" style="margin-top:4px">Kongsi data dengan pasangan supaya kedua-dua telefon nampak kos, simpanan dan tetamu yang sama, dan dikemas kini serta-merta.</div>
      <button type="button" class="btn" id="sxCreate" style="margin-top:12px" ${busy ? 'disabled' : ''}>Cipta bilik &amp; dapatkan kod</button>
      <label for="sxCode">Atau masukkan kod daripada pasangan</label>
      <div class="duo"><input id="sxCode" placeholder="cth: K7F3-QW9P" autocapitalize="characters" autocomplete="off"><button type="button" class="btn line" id="sxJoin" ${busy ? 'disabled' : ''}>Sertai</button></div>`;
    mountEl.querySelector('#sxCreate').onclick = create;
    mountEl.querySelector('#sxJoin').onclick = () => join(mountEl.querySelector('#sxCode').value);
    return;
  }
  mountEl.innerHTML = `<div class="roomcode">${esc(fmtCode(room))}</div>
    <div class="hint" style="text-align:center">${esc(status || 'Menyambung…')}</div>
    <div class="duo" style="margin-top:12px"><button type="button" class="btn line" id="sxShare">Kongsi kod</button><button type="button" class="btn line" id="sxCopy">Salin kod</button></div>
    <div class="hint">Gambar pasangan tidak dikongsi — ia kekal dalam telefon masing-masing.</div>
    <button type="button" class="btn danger" id="sxLeave">Keluar dari bilik</button>`;
  mountEl.querySelector('#sxShare').onclick = share;
  mountEl.querySelector('#sxCopy').onclick = () => copy(fmtCode(room));
  mountEl.querySelector('#sxLeave').onclick = leave;
}

const stub = { ready: false, mount(el) { mountEl = el; view(); }, push() {} };
window.Sync = stub;

if (config) init().catch(e => { console.error(e); status = 'Gagal memuatkan perkongsian'; view(); });

async function init() {
  const V = '10.12.2';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache() }); }
  catch (e) { db = F.initializeFirestore(app, { ignoreUndefinedProperties: true }); }
  const authed = A.signInAnonymously(auth);

  let unsub = null, last = null;
  const ref = code => F.doc(db, 'rooms', code);

  const asMap = arr => Object.fromEntries((arr || []).map((x, i) => [x.id, { ...x, _o: i }]));
  const asArr = m => Object.values(m || {}).sort((a, b) => (a._o ?? 0) - (b._o ?? 0) || String(a.id).localeCompare(String(b.id))).map(({ _o, ...x }) => x);
  function toRemote(S) {
    const settings = { ...S.settings }; LOCAL_ONLY.forEach(k => delete settings[k]);
    const r = { v: 1, settings };
    COLLS.forEach(c => r[c] = asMap(S[c]));
    return r;
  }
  function fromRemote(r) {
    const s = { settings: { ...(r.settings || {}) } };
    COLLS.forEach(c => s[c] = asArr(r[c]));
    return s;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function subscribe() {
    unsub && unsub();
    status = 'Menyambung…'; view();
    unsub = F.onSnapshot(ref(room), { includeMetadataChanges: true }, snap => {
      if (!snap.exists()) { status = 'Bilik tidak dijumpai'; view(); return; }
      const r = snap.data();
      const cur = toRemote(App.S);
      last = { v: 1, settings: r.settings || {} }; COLLS.forEach(c => last[c] = r[c] || {});
      if (!same(last, cur)) App.applyRemote(fromRemote(r));
      status = snap.metadata.fromCache ? 'Luar talian — perubahan akan dihantar bila ada internet'
        : snap.metadata.hasPendingWrites ? 'Menghantar perubahan…' : 'Disegerakkan dengan pasangan ✓';
      view();
    }, err => { status = 'Ralat sambungan: ' + (err.code || err.message); view(); });
  }

  async function push() {
    if (!room || !last) return;
    const cur = toRemote(App.S), up = {};
    COLLS.forEach(c => {
      for (const id in cur[c]) if (!same(cur[c][id], last[c][id])) up[`${c}.${id}`] = cur[c][id];
      for (const id in last[c]) if (!(id in cur[c])) up[`${c}.${id}`] = F.deleteField();
    });
    for (const k in cur.settings) if (!same(cur.settings[k], last.settings[k])) up[`settings.${k}`] = cur.settings[k] ?? null;
    if (!Object.keys(up).length) return;
    last = cur;
    try { await authed; await F.updateDoc(ref(room), { ...up, updatedAt: F.serverTimestamp() }); }
    catch (e) { console.error(e); status = 'Gagal menghantar: ' + (e.code || e.message); view(); }
  }

  function setRoom(code) { room = code; try { localStorage.setItem(ROOMKEY, code); } catch (e) {} subscribe(); }

  async function create() {
    if (busy) return; busy = true; view();
    try {
      await authed;
      const rnd = crypto.getRandomValues(new Uint32Array(8));
      const code = Array.from(rnd, n => ALPHA[n % ALPHA.length]).join('');
      await F.setDoc(ref(code), { ...toRemote(App.S), createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
      setRoom(code); toast('Bilik dicipta — kongsi kod kepada pasangan');
    } catch (e) { console.error(e); toast('Gagal cipta bilik'); status = 'Ralat: ' + (e.code || e.message); }
    busy = false; view();
  }

  async function join(input) {
    const code = normCode(input);
    if (code.length !== 8) { toast('Kod mesti 8 aksara, cth: K7F3-QW9P'); return; }
    if (busy) return; busy = true; view();
    try {
      await authed;
      const snap = await F.getDoc(ref(code));
      if (!snap.exists()) { toast('Kod tidak dijumpai'); }
      else if (confirm('Sertai bilik ' + fmtCode(code) + '?\n\nData dalam telefon ini akan diganti dengan data bilik (gambar pasangan kekal).')) {
        App.applyRemote(fromRemote(snap.data())); setRoom(code); toast('Berjaya sertai bilik');
      }
    } catch (e) { console.error(e); toast('Gagal sertai: ' + (e.code || e.message)); }
    busy = false; view();
  }

  function leave() {
    if (!confirm('Keluar dari bilik?\n\nData sedia ada kekal dalam telefon ini, tetapi tidak lagi dikemas kini dengan pasangan.')) return;
    unsub && unsub(); unsub = null; last = null; room = null; status = '';
    try { localStorage.removeItem(ROOMKEY); } catch (e) {}
    view(); toast('Keluar dari bilik');
  }

  window.Sync = { ready: true, mount(el) { mountEl = el; view(); }, push };
  Object.assign(H, { create, join, leave });

  if (room) subscribe();
  const param = normCode(new URLSearchParams(location.search).get('bilik'));
  if (param) {
    history.replaceState(null, '', location.pathname);
    if (param !== room) join(param);
  }
}

async function share() {
  const url = location.origin + location.pathname + '?bilik=' + room;
  const text = `Jom urus persiapan kahwin kita sama-sama 💍\nBuka app ini dan sertai bilik dengan kod: ${fmtCode(room)}`;
  if (navigator.share) { try { await navigator.share({ title: 'Persediaan Kahwin', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copy(text + '\n' + url);
}
async function copy(t) {
  try { await navigator.clipboard.writeText(t); toast('Disalin'); }
  catch (e) { prompt('Salin teks ini:', t); }
}
function create() { H.create ? H.create() : toast('Sedang memuatkan…'); }
function join(c) { H.join ? H.join(c) : toast('Sedang memuatkan…'); }
function leave() { H.leave && H.leave(); }
