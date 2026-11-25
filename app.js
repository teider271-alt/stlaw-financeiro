/* S&T LAW — financeiro no iPhone.
 * Tudo fica neste aparelho (armazenamento local do navegador). Nada é enviado a servidor algum:
 * a troca com o Mac é feita por um arquivo que VOCÊ salva/abre no iCloud Drive (pasta "S&T LAW").
 * As regras (divisão em 3, caixa do escritório, recebimentos, taxas anuais) são as mesmas do app do Mac. */
'use strict';

const STORE = 'stlaw.dados.v1';
const PREV = 'stlaw.anterior.v1';
const FORMAT = 'stlaw-financeiro';
const FILE_NAME = 'stlaw-financeiro.json';
const PARTNERS = ['Lucas Fiorin Seregati', 'Diego Teider'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CAT_IN = ['Honorários contratuais', 'Honorários de êxito', 'Honorários sucumbenciais', 'Taxa de manutenção', 'Outras receitas'];
const CAT_OUT = ['Marketing e tráfego', 'Tecnologia e sistemas', 'Taxas de cartão', 'Contabilidade', 'Custas e correspondentes',
  'OAB e impostos', 'Comissões e indicações', 'Despesas gerais', 'Outras despesas'];
const SUCUMB = 'Honorários sucumbenciais', MANUT = 'Taxa de manutenção';

// ───────────── Armazenamento ─────────────

function emptyData() { return { finance_plans: [], finance_entries: [], office_cash: [] }; }
function readJSON(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; }
  catch { toast('Não foi possível gravar no aparelho (armazenamento cheio ou bloqueado).'); return false; }
}

let db = readJSON(STORE) || { data: emptyData(), meta: {} };
if (!db.data) db = { data: emptyData(), meta: {} };

function persist() { writeJSON(STORE, db); updateDirty(); }

/** Impressão estável dos dados (chaves ordenadas) para saber se há alterações ainda não salvas no iCloud. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function fingerprint(data) { return cyrb53(stable(data)); }
function hasData() { return db.data.finance_entries.length > 0; }
function isDirty() { return hasData() && db.meta.hash !== fingerprint(db.data); }

// ───────────── Datas e dinheiro ─────────────

const pad = n => String(n).padStart(2, '0');
function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function today() { return isoDate(new Date()); }
function currentMonth() { return today().slice(0, 7); }
function nowStamp() {
  const d = new Date(), off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-';
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
function sqlNow() { const d = new Date(); return `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad(t % 12 + 1)}`; }
function monthName(ym) { const m = MONTHS[Number(ym.slice(5, 7)) - 1] || ''; return m.charAt(0).toUpperCase() + m.slice(1); }
function monthLabel(ym) { return `${monthName(ym)} de ${ym.slice(0, 4)}`; }
function br(iso) { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function brShort(iso) { return iso ? br(iso).slice(0, 5) : '—'; }
function humanStamp(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return s;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Mesma regra do Mac: soma meses/anos ajustando o dia ao fim do mês (31/01 + 1 mês = 28/02). */
function addDate(iso, frequency, times) {
  const [y, m, d] = iso.split('-').map(Number);
  if (frequency === 'quinzenal') { const dt = new Date(y, m - 1, d + 14 * times); return isoDate(dt); }
  const months = frequency === 'anual' ? 12 * times : times;
  const total = y * 12 + (m - 1) + months, ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function money(c) { return fmt.format((c || 0) / 100).replace(/ /g, ' '); }
function moneyEdit(c) { return ((c || 0) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function bigMoney(c) {
  const s = money(c); const i = s.lastIndexOf(',');
  return i < 0 ? s : `${esc(s.slice(0, i))}<small>${esc(s.slice(i))}</small>`;
}
/** "1.500,00", "1500", "1500,5", "-494,77" → centavos. */
function parseMoney(text) {
  let t = String(text || '').replace(/R\$|\s/g, '');
  if (!t) return null;
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return neg ? -c : c;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ───────────── Regras do financeiro (iguais às do Mac) ─────────────

const live = () => db.data.finance_entries.filter(e => !e.deleted_at);
const eff = e => e.status === 'pago' ? (e.paid_cents ?? e.amount_cents) : e.amount_cents;
function displayStatus(e) { if (e.status === 'pago') return 'pago'; if (e.due_date && e.due_date < today()) return 'atrasado'; return 'pendente'; }
function monthFor(e) {
  const src = e.status === 'pago' ? (e.paid_date || e.entry_date) : (e.due_date || e.entry_date);
  if (src && src.length >= 7) return src.slice(0, 7);
  return e.month || currentMonth();
}
function shortTitle(e) {
  let parts = (e.description || '').split(' — ').filter(p => !(p.startsWith('parcela ') || p.startsWith('ocorrência ')));
  if (parts.length > 1 && ['Parcelamento', 'Taxa anual de manutenção', 'Recorrência'].includes(parts[0])) parts.shift();
  return parts.join(' — ');
}
function ledger(month, kind) { return live().filter(e => e.month === month && e.kind === kind && (e.status === 'pago' || e.due_date)); }
function sum(list, f = eff) { return list.reduce((a, e) => a + f(e), 0); }
function indicators(month) {
  const paid = live().filter(e => e.status === 'pago');
  const ins = sum(paid.filter(e => e.kind === 'entrada' && e.month === month));
  const outs = sum(paid.filter(e => e.kind === 'saida' && e.month === month));
  const accIn = sum(paid.filter(e => e.kind === 'entrada' && e.month <= month));
  const accOut = sum(paid.filter(e => e.kind === 'saida' && e.month <= month));
  return { entradas: ins, saidas: outs, saldo: ins - outs, acumulado: accIn - accOut };
}
/** Entradas recebidas "dividir em 3" são repartidas sem descontar as contas; o terço do escritório paga as contas. */
function division(month) {
  const d = { dividido: 0, integral: 0, contas: 0 };
  for (const e of live()) {
    if (e.month !== month || e.status !== 'pago') continue;
    if (e.kind === 'saida') d.contas += eff(e);
    else if (e.split_mode === 'escritorio') d.integral += eff(e);
    else d.dividido += eff(e);
  }
  d.socio = Math.floor(d.dividido / 3);
  d.tercoEscritorio = d.dividido - d.socio * 2;
  d.saldoEscritorio = d.tercoEscritorio + d.integral - d.contas;
  return d;
}
function opening(month) { const r = db.data.office_cash.find(o => o.month === month); return r ? r.opening_cents : null; }
function officeCash(month) { const o = opening(month), d = division(month); return { opening: o, division: d, closing: (o ?? 0) + d.saldoEscritorio }; }
function suggestedOpening(month) { const c = officeCash(addMonths(month, -1)); return c.opening === null ? null : c.closing; }
function pendingIn() { return live().filter(e => e.kind === 'entrada' && e.status === 'pendente'); }
function toReceive(month) {
  const list = ledger(month, 'entrada').filter(e => e.status === 'pendente');
  if (month === currentMonth()) list.push(...pendingIn().filter(e => (e.due_date || '9999') < month + '-01'));
  return list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}
function planEntries(id) { return live().filter(e => e.plan_id === id).sort((a, b) => (a.due_date || a.paid_date || '').localeCompare(b.due_date || b.paid_date || '')); }

function nextId() { return db.data.finance_entries.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1; }

function newEntry(kind, month) {
  const date = month === currentMonth() ? today() : month + '-01';
  return {
    id: null, kind, description: '', category: kind === 'entrada' ? CAT_IN[0] : CAT_OUT[0], client_name: null,
    amount_cents: 0, paid_cents: null, entry_date: date, day_known: 1, due_date: null, paid_date: date,
    month, status: 'pago', notes: null, plan_id: null, installment_number: null, installment_total: null,
    origin: 'iphone', origin_ref: null, created_at: null, updated_at: null, deleted_at: null, split_mode: 'socios'
  };
}

function saveEntry(e) {
  e.description = (e.description || '').trim();
  if (!e.description) throw new Error('Informe a descrição.');
  if (!(e.amount_cents > 0)) throw new Error('Informe um valor válido (ex.: 1.500,00).');
  if (e.status === 'pago' && !e.paid_date) e.paid_date = e.entry_date || today();
  if (e.status === 'pendente') { e.paid_date = null; e.paid_cents = null; }
  e.month = monthFor(e);
  e.updated_at = sqlNow();
  if (e.id == null) {
    e.id = nextId(); e.created_at = e.updated_at;
    db.data.finance_entries.push(e);
  } else {
    const i = db.data.finance_entries.findIndex(x => x.id === e.id);
    if (i >= 0) db.data.finance_entries[i] = e; else db.data.finance_entries.push(e);
  }
  persist();
  return e;
}

/** Baixa de UM lançamento; em recorrência sem fim (taxa anual) gera o próximo vencimento, como no Mac. */
function markPaid(entry, date, amount, split) {
  const e = { ...entry };
  if (split && e.kind === 'entrada') e.split_mode = split;
  e.status = 'pago'; e.paid_date = date; e.day_known = 1;
  e.paid_cents = (amount == null || amount === e.amount_cents) ? null : amount;
  saveEntry(e);
  if (e.plan_id) extendRecurrence(e.plan_id);
  return e;
}
function extendRecurrence(planId) {
  const plan = db.data.finance_plans.find(p => p.id === planId);
  if (!plan || plan.plan_type !== 'recorrente' || plan.installments != null || !plan.active) return;
  const list = planEntries(planId);
  if (list.some(e => e.status === 'pendente')) return;
  const last = list.filter(e => e.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).pop();
  if (!last) return;
  const n = newEntry(plan.kind, currentMonth());
  Object.assign(n, {
    category: plan.category, client_name: plan.client_name, description: plan.description, amount_cents: last.amount_cents,
    due_date: addDate(last.due_date, plan.frequency, 1), entry_date: today(), status: 'pendente', paid_date: null,
    plan_id: planId, installment_number: (last.installment_number ?? list.length) + 1, split_mode: last.split_mode || 'socios', origin: 'manual'
  });
  saveEntry(n);
}
function reopen(entry) {
  const e = { ...entry, status: 'pendente' };
  if (!e.due_date) e.due_date = e.paid_date;
  saveEntry(e);
}
function trash(entry) {
  const e = db.data.finance_entries.find(x => x.id === entry.id);
  if (e) { e.deleted_at = sqlNow(); persist(); }
}
function setOpening(month, cents) {
  db.data.office_cash = db.data.office_cash.filter(o => o.month !== month);
  if (cents !== null) db.data.office_cash.push({ month, opening_cents: cents, notes: null, updated_at: sqlNow() });
  db.data.office_cash.sort((a, b) => a.month.localeCompare(b.month));
  persist();
}

// ───────────── Troca com o Mac (arquivo no iCloud Drive) ─────────────

async function saveToICloud() {
  if (!hasData()) { toast('Ainda não há dados para salvar.'); return; }
  const stamp = nowStamp();
  const doc = { format: FORMAT, version: 1, schema: db.meta.schema || 7, exportedAt: stamp, device: 'iphone', data: db.data };
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const file = new File([blob], FILE_NAME, { type: 'application/json' });
  const done = () => {
    db.meta.hash = fingerprint(db.data); db.meta.stamp = stamp;
    db.meta.when = 'salvo no iCloud em ' + humanStamp(stamp);
    persist(); render();
  };
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      done(); toast('Arquivo salvo. No Mac, é só abrir o app.');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') { toast('Nada foi salvo.'); return; }
  }
  // Sem a folha de compartilhar: baixa o arquivo (depois mova para iCloud Drive › S&T LAW).
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = FILE_NAME;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  done(); toast('Arquivo baixado — mova-o para iCloud Drive › S&T LAW.');
}

function pickFromICloud() { const inp = document.getElementById('file-input'); inp.value = ''; inp.click(); }

async function onFilePicked(file) {
  if (!file) return;
  let doc;
  try { doc = JSON.parse(await file.text()); } catch { toast('Esse arquivo não pôde ser lido.'); return; }
  const data = doc && doc.data;
  if (!doc || doc.format !== FORMAT || !data || !Array.isArray(data.finance_entries) || !Array.isArray(data.finance_plans) || !Array.isArray(data.office_cash)) {
    toast('Esse não é o arquivo do S&T LAW (stlaw-financeiro.json).'); return;
  }
  const count = data.finance_entries.filter(e => !e.deleted_at).length;
  const from = doc.device === 'mac' ? 'do Mac' : 'deste iPhone';
  const warn = isDirty()
    ? '<p class="note red">Atenção: este iPhone tem alterações que ainda não foram salvas no iCloud. Elas serão substituídas (fica uma cópia para desfazer).</p>'
    : '';
  openSheet(`
    <div class="eyebrow">Carregar do iCloud Drive</div>
    <h2>Atualizar com o arquivo ${from}</h2>
    <p class="note">Arquivo de ${esc(humanStamp(doc.exportedAt))} · ${count} lançamentos.</p>
    <p class="note">Os dados deste iPhone serão trocados pelos do arquivo. A versão atual fica guardada e pode ser desfeita.</p>
    ${warn}
    <div class="stack">
      <button class="btn" data-action="confirm-load">Atualizar agora</button>
      <button class="btn sec" data-action="close-sheet">Cancelar</button>
    </div>`);
  pendingLoad = doc;
}
let pendingLoad = null;
function confirmLoad() {
  const doc = pendingLoad; if (!doc) return;
  if (hasData()) writeJSON(PREV, db);
  db = { data: { finance_plans: doc.data.finance_plans, finance_entries: doc.data.finance_entries, office_cash: doc.data.office_cash }, meta: {} };
  db.meta.schema = doc.schema || 7;
  db.meta.hash = fingerprint(db.data);
  db.meta.stamp = doc.exportedAt;
  db.meta.when = (doc.device === 'mac' ? 'recebido do Mac' : 'carregado') + ' — arquivo de ' + humanStamp(doc.exportedAt);
  pendingLoad = null;
  persist(); closeSheet(); state.tab = 'inicio'; state.month = currentMonth(); render();
  toast('Dados atualizados.');
}
function undoLoad() {
  const prev = readJSON(PREV); if (!prev) return;
  const cur = db; db = prev; writeJSON(PREV, cur);
  persist(); render(); toast('Voltou para a versão anterior.');
}

// ───────────── Interface ─────────────

const state = { tab: 'inicio', month: currentMonth(), caixaFilter: 'tudo', recvGroup: null };
const $ = s => document.querySelector(s);
let toastTimer = null;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function updateDirty() { $('#dirty').hidden = !isDirty(); }

// Ícones (traço, 24×24)
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  swap: 'M7 4v16M7 4 3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4',
  bills: 'M9 6h11M9 12h11M9 18h11M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  cloud: 'M7 18.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.2 10 4.3 4.3 0 0 1 18 18.5z',
  down: 'M12 5v14M6 13l6 6 6-6',
  up: 'M12 19V5M6 11l6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l6 4V6l-6 4H4a1 1 0 0 0-1 1zM16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12',
  cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  card: 'M3 6.5h18v11H3zM3 10.5h18M7 14.5h3',
  calc: 'M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  bank: 'M4 21V9.5L12 4l8 5.5V21M8 21v-7M12 21v-7M16 21v-7M3 21h18',
  hand: 'M7 11l3-3 4 2 3-1 4 4-6 6-3-2-2 2-6-6zM3 13l4-4',
  bag: 'M5 8h14l-1 12.5H6zM9 8V6.5a3 3 0 0 1 6 0V8',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  briefcase: 'M3 8h18v11H3zM8.5 8V5.5h7V8M3 13h18',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7',
  scale: 'M12 4v16M6 20h12M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z',
  calendar: 'M4 6h16v15H4zM4 10.5h16M8 3v4M16 3v4',
  wallet: 'M3 7.5h15a3 3 0 0 1 3 3V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7.5 15 3.5v4M16.5 14h.01',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2.5 21a6.5 6.5 0 0 1 13 0M16 3.3a4 4 0 0 1 0 7.4M21.5 21a6.5 6.5 0 0 0-4-6',
  alert: 'M12 9v4M12 16.5h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  pie: 'M12 3v9h9M12 3a9 9 0 1 0 9 9',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
function icon(name, size = 20, sw = 1.9) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.dots}"/></svg>`;
}

// Cor e ícone por categoria (ordem fixa, a mesma do Mac em "Para onde foi o dinheiro").
const CAT_STYLE = {
  'Marketing e tráfego': ['megaphone', '#E2622E'], 'Tecnologia e sistemas': ['cpu', '#115384'], 'Taxas de cartão': ['card', '#17A2A0'],
  'Contabilidade': ['calc', '#7B61D9'], 'Custas e correspondentes': ['file', '#D9A21B'], 'OAB e impostos': ['bank', '#C94F7C'],
  'Comissões e indicações': ['hand', '#4E9A5B'], 'Despesas gerais': ['bag', '#8A9AAB'], 'Outras despesas': ['dots', '#8A9AAB'],
  'Honorários contratuais': ['briefcase', '#115384'], 'Honorários de êxito': ['trophy', '#C98A1E'], 'Honorários sucumbenciais': ['scale', '#2E7D5B'],
  'Taxa de manutenção': ['calendar', '#1D6FAE'], 'Outras receitas': ['plus', '#4E9A5B'],
};
function catStyle(c) { return CAT_STYLE[c] || ['dots', '#8A9AAB']; }
function catIcon(c, size = 40) {
  const [ic, color] = catStyle(c);
  return `<div class="ic" style="width:${size}px;height:${size}px;background:${color}1A;color:${color}">${icon(ic, Math.round(size * .5))}</div>`;
}
function compact(c) {
  const v = Math.abs(c) / 100, s = c < 0 ? '−' : '';
  if (v >= 1000) return s + 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return money(c);
}
function yearTotals(year) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${pad(m)}`;
    const paid = live().filter(e => e.month === ym && e.status === 'pago');
    out.push({ ym, ins: sum(paid.filter(e => e.kind === 'entrada')), outs: sum(paid.filter(e => e.kind === 'saida')) });
  }
  return out;
}
function categoryTotals(month, kind) {
  const map = new Map();
  for (const e of live()) if (e.month === month && e.kind === kind && e.status === 'pago') map.set(e.category, (map.get(e.category) || 0) + eff(e));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// ───────── Gráficos (SVG) ─────────

/** Entradas × saídas dos 12 meses, no herói escuro. Tocar num mês abre o mês. */
function yearChart(month) {
  const data = yearTotals(month.slice(0, 4));
  const max = Math.max(1, ...data.map(d => Math.max(d.ins, d.outs)));
  const W = 340, H = 96, top = 6, step = W / 12, bw = 7, gap = 2;
  const letters = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const bar = (x, v, color, op) => {
    if (v <= 0) return `<rect x="${x}" y="${top + H - 2}" width="${bw}" height="2" rx="1" fill="${color}" opacity="${op * .5}"/>`;
    const h = Math.max(4, (v / max) * H);
    return `<path d="M${x},${top + H} V${top + H - h + 3} a3,3 0 0 1 3,-3 h${bw - 6} a3,3 0 0 1 3,3 V${top + H} z" fill="${color}" opacity="${op}"/>`;
  };
  let s = '';
  data.forEach((d, i) => {
    const cx = i * step + step / 2, on = d.ym === month, op = on ? 1 : .42;
    if (on) s += `<rect x="${i * step + 2}" y="0" width="${step - 4}" height="${top + H + 22}" rx="9" fill="#fff" opacity=".07"/>`;
    s += bar(cx - bw - gap / 2, d.ins, '#8CC4EE', op) + bar(cx + gap / 2, d.outs, '#F59A6E', op);
    s += `<text x="${cx}" y="${top + H + 15}" text-anchor="middle" font-size="10" font-weight="${on ? 700 : 500}" fill="#fff" opacity="${on ? 1 : .5}">${letters[i]}</text>`;
    s += `<rect x="${i * step}" y="0" width="${step}" height="${top + H + 22}" fill="transparent" data-action="pick-month" data-m="${d.ym}"/>`;
  });
  return `<div class="year-chart"><svg viewBox="0 0 ${W} ${top + H + 22}" role="img" aria-label="Entradas e saídas por mês">${s}</svg>
    <div class="chart-legend"><span><i style="background:#8CC4EE"></i>Entradas</span><span><i style="background:#F59A6E"></i>Saídas</span><span>toque num mês para abrir</span></div></div>`;
}

/** Rosca com segmentos separados por um respiro de 2px. */
function donut(parts, size = 128, stroke = 16, centerTop = '', centerBottom = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  let off = 0, segs = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF2F6" stroke-width="${stroke}"/>`;
  if (total > 0) for (const p of parts) {
    if (p.value <= 0) continue;
    const len = (p.value / total) * c, vis = Math.max(0, len - 3);
    segs += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}" stroke-linecap="butt"
      stroke-dasharray="${vis} ${c - vis}" stroke-dashoffset="${-off}"/>`;
    off += len;
  }
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">${segs}</svg>
    <div class="dc"><div><b>${centerTop}</b><small>${centerBottom}</small></div></div></div>`;
}

function ring(frac, color, size = 64, stroke = 8) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, frac)) * c;
  return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EEF2F6" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${v} ${c}"/></svg>`;
}

// ───────── Herói e abas ─────────

const TABS = [['inicio', 'home', 'Início'], ['caixa', 'swap', 'Caixa'], ['contas', 'bills', 'Contas'], ['receber', 'inbox', 'A receber'], ['icloud', 'cloud', 'iCloud']];

function monthNav() {
  const m = state.month;
  return `<div class="month-nav">
    <button class="mn-btn" data-action="prev-month" aria-label="Mês anterior">${icon('left', 18, 2.2)}</button>
    <button class="mn-label" data-action="this-month">${esc(monthName(m))} ${m.slice(0, 4)}<small>${m === currentMonth() ? 'este mês' : 'toque para voltar a hoje'}</small></button>
    <button class="mn-btn" data-action="next-month" aria-label="Próximo mês">${icon('right', 18, 2.2)}</button></div>`;
}
function heroBig(c) {
  const s = money(c), i = s.lastIndexOf(',');
  return `<div class="hero-big num ${c < 0 ? 'neg' : ''}">${esc(s.slice(0, i))}<small>${esc(s.slice(i))}</small></div>`;
}
function bigMoney2(c) { const s = money(c), i = s.lastIndexOf(','); return `${esc(s.slice(0, i))}<small>${esc(s.slice(i))}</small>`; }
function glass(kind, ic, label, value) {
  return `<div class="glass"><div class="gh"><div class="gi ${kind}">${icon(ic, 15, 2.4)}</div><div class="gl">${label}</div></div><div class="gv num">${value}</div></div>`;
}

function heroHTML() {
  if (!hasData() && state.tab !== 'icloud') return `<div class="hero-center"><div class="hero-label">Bem-vindo</div><div class="hero-sub">Carregue o arquivo do Mac para começar</div></div>`;
  const m = state.month, ind = hasData() ? indicators(m) : null;
  switch (state.tab) {
    case 'inicio': return `${monthNav()}<div class="hero-center"><div class="hero-label">Saldo do mês</div>${heroBig(ind.saldo)}</div>
      <div class="glass-row">${glass('in', 'down', 'Entrou', money(ind.entradas))}${glass('out', 'up', 'Saiu', money(ind.saidas))}</div>${yearChart(m)}`;
    case 'caixa': return `${monthNav()}<div class="glass-row">${glass('in', 'down', 'Entrou', money(ind.entradas))}${glass('out', 'up', 'Saiu', money(ind.saidas))}</div>
      <div class="glass-row" style="grid-template-columns:1fr">${glass(ind.saldo < 0 ? 'bad' : 'ok', 'wallet', 'Saldo do mês · acumulado ' + compact(ind.acumulado), money(ind.saldo))}</div>`;
    case 'contas': {
      const outs = ledger(m, 'saida'), open = outs.filter(e => e.status === 'pendente');
      return `${monthNav()}<div class="hero-center"><div class="hero-label">Em aberto</div>${heroBig(sum(open, e => e.amount_cents))}
        <div class="hero-sub">${open.length ? open.length + ' conta(s) para pagar' : 'Tudo pago neste mês'}</div></div>
        <div class="glass-row">${glass('out', 'up', 'Pagas no mês', money(sum(outs.filter(e => e.status === 'pago'))))}${glass(open.some(e => displayStatus(e) === 'atrasado') ? 'bad' : 'ok', 'clock', 'Atrasadas', String(open.filter(e => displayStatus(e) === 'atrasado').length))}</div>`;
    }
    case 'receber': {
      const pend = pendingIn(), late = pend.filter(e => displayStatus(e) === 'atrasado');
      const mes = pend.filter(e => (e.due_date || '').startsWith(currentMonth()));
      return `<div class="hero-center" style="margin-top:4px"><div class="hero-label">Total a receber</div>${heroBig(sum(pend, e => e.amount_cents))}
        <div class="hero-sub">${pend.length} valores pendentes</div></div>
        <div class="glass-row">${glass(late.length ? 'bad' : 'ok', 'alert', 'Em atraso', money(sum(late, e => e.amount_cents)))}${glass('in', 'calendar', 'Vence no mês', money(sum(mes, e => e.amount_cents)))}</div>`;
    }
    case 'icloud': {
      const dirty = isDirty();
      return `<div class="hero-center" style="margin-top:4px"><div class="welcome" style="padding:6px 0 0">
        <div class="bigicon" style="background:rgba(255,255,255,.1);color:${dirty ? '#F59A6E' : '#7FD3A8'}">${icon('cloud', 38, 1.8)}</div></div>
        <div class="hero-label">${dirty ? 'Alterações não salvas' : hasData() ? 'Tudo salvo' : 'Sem dados ainda'}</div>
        <div class="hero-sub">${esc(db.meta.when || 'Ainda não houve troca com o Mac')}</div></div>`;
    }
  }
  return '';
}

function render() {
  $('#tabs').innerHTML = TABS.map(([id, ic, label]) => `<button class="tab ${state.tab === id ? 'on' : ''}" data-tab="${id}">${icon(ic, 22, 1.9)}${label}</button>`).join('');
  $('#fab').innerHTML = icon('plus', 26, 2.4);
  $('#fab').hidden = !(hasData() && ['inicio', 'caixa', 'contas'].includes(state.tab));
  $('#hero').innerHTML = heroHTML();
  updateDirty();
  const v = $('#view');
  if (!hasData() && state.tab !== 'icloud') { v.innerHTML = emptyView(); return; }
  v.innerHTML = ({ inicio: homeView, caixa: cashView, contas: billsView, receber: receivablesView, icloud: syncView }[state.tab])();
}

function emptyView() {
  return `<div class="card welcome">
    <div class="bigicon">${icon('download', 36, 1.8)}</div>
    <div class="title">Traga o financeiro do Mac</div>
    <ol class="steps" style="text-align:left;margin-top:16px">
      <li>No Mac, abra o S&amp;T LAW e clique em <b>iPhone › Enviar para o iPhone</b>.</li>
      <li>Aqui, toque em <b>Carregar do iCloud Drive</b> e escolha <b>S&amp;T LAW › stlaw-financeiro.json</b>.</li>
    </ol>
    <div class="stack"><button class="btn" data-action="pick-file">${icon('download', 20, 2.2)}Carregar do iCloud Drive</button></div>
  </div>`;
}

// ───────── Linhas ─────────

function recvRow(e, label = 'Recebi') {
  const late = displayStatus(e) === 'atrasado';
  const n = e.installment_total > 1 ? `<span class="badge">${e.installment_number}/${e.installment_total}</span>` : '';
  return `<div class="row">${catIcon(e.category)}
    <div class="main"><div class="t"><span class="nm">${esc(e.client_name || shortTitle(e))}</span>${n}</div>
      <div class="s ${late ? 'red' : ''}">${late ? 'atrasado · venceu ' : 'vence '}${e.due_date ? brShort(e.due_date) : '—'}</div></div>
    <div class="rc"><div class="amt num">${money(e.amount_cents)}</div>
      <button class="pill sm ${label === 'Recebi' ? 'green' : 'soft'}" data-action="receive" data-id="${e.id}">${label === 'Recebi' ? icon('check', 14, 2.8) : ''}${label}</button></div>
  </div>`;
}
function entryRow(e) {
  const n = e.installment_total > 1 ? `<span class="badge">${e.installment_number}/${e.installment_total}</span>` : '';
  const office = e.kind === 'entrada' && e.split_mode === 'escritorio' ? '<span class="badge esc">escritório</span>' : '';
  return `<button class="row" data-action="edit" data-id="${e.id}">${catIcon(e.category)}
    <div class="main"><div class="t"><span class="nm">${esc(shortTitle(e))}</span>${n}${office}</div><div class="s">${esc(e.category)}</div></div>
    <div class="amt ${e.kind === 'entrada' ? 'in' : 'out'}">${e.kind === 'entrada' ? '+' : '−'} ${money(eff(e))}</div>
  </button>`;
}
function dayKey(e) { return e.status === 'pago' && e.day_known ? (e.paid_date || e.entry_date || '') : ''; }
function dayLabel(iso) {
  if (!iso) return 'Sem dia informado';
  if (iso === today()) return 'Hoje';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(y, m - 1, d).getDay()];
  return `${d} de ${MONTHS[m - 1]} · ${wd}`;
}
function groupedByDay(list) {
  const groups = new Map();
  for (const e of list.sort((a, b) => dayKey(b).localeCompare(dayKey(a)))) {
    const k = dayKey(e); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e);
  }
  let html = '';
  for (const [k, l] of groups) html += `<div class="day-head">${esc(dayLabel(k))}</div>` + l.map(entryRow).join('');
  return html;
}

// ───────── Telas ─────────

function homeView() {
  const m = state.month, name = monthName(m), prev = monthName(addMonths(m, -1)).toLowerCase();
  const d = division(m), c = officeCash(m), rec = toReceive(m), cats = categoryTotals(m, 'saida');
  const colors = ['#115384', '#5B9BD0', d.saldoEscritorio < 0 ? '#B3343D' : '#2E7D5B'];
  const people = [...PARTNERS.map((p, i) => ({ name: p, role: 'sócio · 1/3 limpo', value: d.socio, color: colors[i] })),
    { name: 'Escritório', role: 'resultado do mês · paga as contas', value: d.saldoEscritorio, color: colors[2] }];
  const catTotal = cats.reduce((a, [, v]) => a + v, 0);
  return `
  <div class="card">
    <div class="card-head"><div class="ci azul">${icon('users')}</div><div class="title">Divisão do resultado<i>${name}</i></div></div>
    <div class="division">
      ${donut(people.map(p => ({ value: p.value, color: p.color })), 156, 18, compact(d.dividido), 'para dividir')}
      <div class="legend">${people.map(p => `<div class="lg"><span class="sw" style="background:${p.color}">${esc(p.name[0])}</span>
        <div class="who"><b>${esc(p.name)}</b><small>${p.role}</small></div>
        <div class="v num" ${p.value < 0 ? 'style="color:var(--perigo)"' : ''}>${money(p.value)}</div></div>`).join('')}</div>
    </div>
    <div class="calc">
      <div class="r"><span>Entradas para dividir</span><span>${money(d.dividido)}</span></div>
      <div class="r"><span>Cada sócio (1/3, limpo)</span><span>${money(d.socio)}</span></div>
      <div class="r"><span>1/3 do escritório</span><span>${money(d.tercoEscritorio)}</span></div>
      ${d.integral ? `<div class="r"><span>+ integrais do escritório</span><span>${money(d.integral)}</span></div>` : ''}
      <div class="r"><span>− contas pagas no mês</span><span>${money(-d.contas)}</span></div>
      <div class="r b ${d.saldoEscritorio < 0 ? 'neg' : ''}"><span>= resultado do escritório</span><span>${money(d.saldoEscritorio)}</span></div>
    </div>
  </div>

  <div class="cash-card ${c.closing < 0 ? 'neg' : ''}">
    <div class="card-head"><div class="ci">${icon('wallet')}</div><div class="title">Caixa do escritório<i>fim de ${name.toLowerCase()}</i></div></div>
    <div class="big num">${bigMoney2(c.closing)}</div>
    <div class="cash-flow">
      <div class="cf"><small>Sobrou de ${prev}</small><b class="num">${c.opening === null ? 'não lançado' : money(c.opening)}</b></div>
      <div class="op">+</div>
      <div class="cf"><small>Resultado do mês</small><b class="num">${money(d.saldoEscritorio)}</b></div>
    </div>
    <button class="btn-ghost-light" data-action="opening">${icon('edit', 17, 2.2)}${c.opening === null ? 'Lançar' : 'Alterar'} saldo de ${prev}</button>
  </div>

  <div class="card flush">
    <div class="card-head"><div class="ci verde">${icon('inbox')}</div><div class="title">A receber<i>${name}</i></div><span class="chip">${money(sum(rec, e => e.amount_cents))}</span></div>
    ${rec.length ? rec.map(e => recvRow(e)).join('') : '<div class="empty">Nada pendente para este mês.</div>'}
  </div>

  <div class="card">
    <div class="card-head"><div class="ci laranja">${icon('pie')}</div><div class="title">Para onde foi o dinheiro<i>${money(catTotal)} em ${name.toLowerCase()}</i></div></div>
    ${cats.length ? cats.map(([cat, v]) => {
      const [, color] = catStyle(cat), pct = catTotal ? Math.round(100 * v / catTotal) : 0;
      return `<div class="cat">${catIcon(cat, 36)}<div class="main"><div class="top"><b>${esc(cat)}</b><span>${money(v)}</span></div>
        <div class="barline"><div class="bar"><span style="width:${Math.max(3, pct)}%;background:${color}"></span></div><div class="pct">${pct}%</div></div></div></div>`;
    }).join('') : '<div class="empty">Nenhuma saída paga neste mês.</div>'}
  </div>`;
}

function cashView() {
  const m = state.month, f = state.caixaFilter;
  const ins = ledger(m, 'entrada').filter(e => e.status === 'pago'), outs = ledger(m, 'saida').filter(e => e.status === 'pago');
  const rec = toReceive(m);
  const list = f === 'entradas' ? ins : f === 'saidas' ? outs : [...ins, ...outs];
  return `
  ${rec.length ? `<div class="card flush">
    <div class="card-head"><div class="ci verde">${icon('inbox')}</div><div class="title">A receber<i>ainda fora do caixa</i></div><span class="chip">${money(sum(rec, e => e.amount_cents))}</span></div>
    ${rec.map(e => recvRow(e)).join('')}</div>` : ''}
  <div class="seg" id="caixa-filter">
    <button data-filter="tudo" class="${f === 'tudo' ? 'on' : ''}">Tudo</button>
    <button data-filter="entradas" class="${f === 'entradas' ? 'on' : ''}">Entradas</button>
    <button data-filter="saidas" class="${f === 'saidas' ? 'on' : ''}">Saídas</button>
  </div>
  <div class="card flush" style="padding-bottom:6px">
    ${list.length ? groupedByDay(list) : '<div class="empty" style="padding-top:18px">Nenhum lançamento neste mês.</div>'}
  </div>`;
}

function billsView() {
  const m = state.month, outs = ledger(m, 'saida');
  const open = outs.filter(e => e.status === 'pendente').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const paid = outs.filter(e => e.status === 'pago');
  const total = outs.length, frac = total ? paid.length / total : 1;
  const openRow = e => {
    const late = displayStatus(e) === 'atrasado';
    return `<div class="row">
      <button class="check ${late ? 'late' : ''}" data-action="pay" data-id="${e.id}" aria-label="Marcar como paga">${icon('check', 15, 3)}</button>
      <button class="main" data-action="edit" data-id="${e.id}" style="text-align:left"><div class="t"><span class="nm">${esc(shortTitle(e))}</span></div>
        <div class="s ${late ? 'red' : ''}">${late ? 'atrasada · venceu ' : 'vence '}${br(e.due_date)}</div></button>
      <div class="amt out">${money(e.amount_cents)}</div></div>`;
  };
  return `
  <div class="card">
    <div class="ring-progress">${ring(frac, '#2E7D5B')}
      <div><div class="title">${paid.length} de ${total} pagas</div><div class="note">${open.length ? 'Toque no círculo quando pagar.' : 'Nenhuma conta em aberto neste mês.'}</div></div></div>
  </div>
  ${open.length ? `<div class="card flush"><div class="card-head"><div class="ci laranja">${icon('clock')}</div><div class="title">Para pagar</div><span class="chip laranja">${money(sum(open, e => e.amount_cents))}</span></div>
    ${open.map(openRow).join('')}</div>` : ''}
  <div class="card flush" style="padding-bottom:6px"><div class="card-head"><div class="ci verde">${icon('check')}</div><div class="title">Pagas</div><span class="chip verde">${money(sum(paid))}</span></div>
    ${paid.length ? paid.sort((a, b) => dayKey(b).localeCompare(dayKey(a))).map(entryRow).join('') : '<div class="empty">Nenhuma conta paga neste mês.</div>'}</div>`;
}

function receivablesView() {
  const pend = pendingIn();
  const parcelPlans = db.data.finance_plans.filter(p => p.plan_type === 'parcelamento' && p.kind === 'entrada' && p.active);
  const parcelIds = new Set(parcelPlans.map(p => p.id));
  const maint = pend.filter(e => e.category === MANUT);
  const months = [...new Set(maint.map(e => (e.due_date || 'sem data').slice(0, 7)))].sort();
  const sucumb = pend.filter(e => e.category === SUCUMB);
  const others = pend.filter(e => e.category !== MANUT && e.category !== SUCUMB && !parcelIds.has(e.plan_id));
  const plans = parcelPlans.map(p => {
    const list = planEntries(p.id), paid = list.filter(e => e.status === 'pago'), open = list.filter(e => e.status === 'pendente');
    return { p, list, paid, open, remaining: sum(open, e => e.amount_cents), next: open[0], overdue: open.filter(e => displayStatus(e) === 'atrasado').length };
  }).filter(x => x.remaining > 0);

  const groups = [
    ...months.map(ym => ({ id: 'm' + ym, icon: 'calendar', color: '#1D6FAE', title: 'Manutenção · ' + (ym === 'sem data' ? 'sem data' : monthName(ym).slice(0, 3).toLowerCase() + '/' + ym.slice(2, 4)),
      head: 'Taxas de manutenção', headSub: ym === 'sem data' ? 'sem vencimento' : monthLabel(ym),
      list: maint.filter(e => (e.due_date || 'sem data').slice(0, 7) === ym), sub: n => `${n} cliente(s)` })),
    { id: 'sucumb', icon: 'scale', color: '#2E7D5B', title: 'Sucumbências', list: sucumb, sub: n => `${n} estimativa(s)` },
    { id: 'parcel', icon: 'briefcase', color: '#115384', title: 'Parcelamentos', list: plans.flatMap(x => x.open), sub: () => `${plans.length} cliente(s)` },
    ...(others.length ? [{ id: 'outros', icon: 'dots', color: '#8A9AAB', title: 'Outros', list: others, sub: n => `${n} valor(es)` }] : []),
  ];
  const sel = groups.find(g => g.id === state.recvGroup) || groups[0];
  const cards = groups.map(g => `<button class="gcard ${g === sel ? 'on' : ''}" data-action="recv-group" data-g="${g.id}">
      <div class="ic" style="width:34px;height:34px;border-radius:11px;background:${g.color}1A;color:${g.color}">${icon(g.icon, 18)}</div>
      <div class="gt">${esc(g.title)}</div><div class="gv num">${money(sum(g.list, e => e.amount_cents))}</div><div class="gs">${g.sub(g.list.length)}</div></button>`).join('');

  let detail = '';
  if (sel.id === 'parcel') {
    detail = plans.map(x => {
      const pct = Math.round(100 * x.paid.length / Math.max(1, x.list.length));
      return `<div class="row" style="flex-wrap:wrap">${catIcon(x.p.category)}
        <div class="main"><div class="t"><span class="nm">${esc(x.p.client_name || x.p.description)}</span></div>
          <div class="s ${x.overdue ? 'red' : ''}">${x.paid.length} de ${x.list.length} pagas${x.next && x.next.due_date ? ' · próxima ' + br(x.next.due_date) : ''}</div></div>
        <div class="amt">${money(x.remaining)}</div>
        <div style="flex-basis:100%;padding-left:52px;display:flex;align-items:center;gap:10px">
          <div class="bar" style="flex:1;margin:0"><span style="width:${Math.max(3, pct)}%;background:#115384"></span></div>
          ${x.next ? `<button class="pill soft" data-action="receive" data-id="${x.next.id}">Receber parcela</button>` : ''}</div>
      </div>`;
    }).join('') || '<div class="empty">Nenhum parcelamento em aberto.</div>';
  } else {
    const list = [...sel.list].sort((a, b) => ((a.due_date || '') + (a.client_name || '')).localeCompare((b.due_date || '') + (b.client_name || '')));
    detail = list.map(e => recvRow(e, 'Receber')).join('') || '<div class="empty">Nada pendente aqui.</div>';
  }
  return `
  <div class="group-grid">${cards}</div>
  <div class="card flush" style="padding-bottom:6px">
    <div class="card-head"><div class="ci" style="background:${sel.color}1A;color:${sel.color}">${icon(sel.icon)}</div>
      <div class="title">${esc(sel.head || sel.title)}<i>${esc(sel.headSub || money(sum(sel.list, e => e.amount_cents)))}</i></div></div>
    ${sel.id === 'sucumb' ? '<div class="empty" style="padding-bottom:6px">Valores estimados e sem data: entram quando o processo termina.</div>' : ''}
    ${detail}
  </div>`;
}

function syncView() {
  const prev = readJSON(PREV);
  return `
  <button class="choice" data-action="save-icloud" ${hasData() ? '' : 'disabled'}>
    <div class="ic" style="background:rgba(17,83,132,.09);color:#115384">${icon('upload', 22)}</div>
    <div><b>Salvar no iCloud Drive</b><small>Depois de atualizar aqui · o Mac puxa ao abrir</small></div></button>
  <button class="choice" data-action="pick-file">
    <div class="ic" style="background:rgba(46,125,91,.10);color:#2E7D5B">${icon('download', 22)}</div>
    <div><b>Carregar do iCloud Drive</b><small>Depois de atualizar no Mac</small></div></button>
  <div class="card">
    <div class="card-head"><div class="ci azul">${icon('cloud')}</div><div class="title">Como funciona</div></div>
    <ol class="steps">
      <li><b>Atualizou no iPhone?</b> Salvar no iCloud Drive › <b>Salvar em Arquivos</b> › iCloud Drive › <b>S&amp;T LAW</b> › Salvar (substituir).</li>
      <li><b>Atualizou no Mac?</b> No Mac: <b>iPhone › Enviar para o iPhone</b>. Aqui: Carregar do iCloud Drive › <b>stlaw-financeiro.json</b>.</li>
      <li>Use um aparelho por vez e salve antes de trocar.</li>
    </ol>
  </div>
  ${prev ? `<button class="choice" data-action="undo-load">
    <div class="ic" style="background:rgba(179,52,61,.10);color:#B3343D">${icon('undo', 22)}</div>
    <div><b>Desfazer a última carga</b><small>Volta para os dados que estavam aqui antes</small></div></button>` : ''}`;
}

// ───────── Folhas (formulários) ─────────

function openSheet(html) {
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
  $('#sheet').scrollTop = 0;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; $('#sheet').innerHTML = ''; editing = null; }
let editing = null;
const findEntry = id => db.data.finance_entries.find(e => e.id === Number(id));
function sheetHead(e, eyebrow, title) {
  return `<div class="sheet-head">${catIcon(e.category, 46)}<div><div class="eyebrow">${eyebrow}</div><h2>${esc(title)}</h2></div></div>`;
}

function receiveSheet(e) {
  editing = e;
  openSheet(`${sheetHead(e, 'Registrar recebimento', e.client_name || shortTitle(e))}
    <div class="sheet-amount num">${money(e.amount_cents)}</div>
    <p class="note" style="text-align:center;margin:0 0 6px">${e.due_date ? 'vence ' + br(e.due_date) : 'sem vencimento'}</p>
    <div class="stack">
      <button class="choice" data-action="recv-now" data-split="socios"><div class="ic" style="background:rgba(17,83,132,.09);color:#115384">${icon('users', 22)}</div>
        <div><b>Recebi hoje — dividir em 3</b><small>1/3 para cada sócio, 1/3 do escritório</small></div></button>
      <button class="choice" data-action="recv-now" data-split="escritorio"><div class="ic" style="background:rgba(46,125,91,.10);color:#2E7D5B">${icon('wallet', 22)}</div>
        <div><b>Recebi hoje — integral do escritório</b><small>Fica todo no caixa do escritório</small></div></button>
      <button class="btn sec" data-action="recv-other">Outra data ou valor…</button>
    </div>`);
}
function receiveOtherSheet(e) {
  editing = e;
  openSheet(`${sheetHead(e, 'Registrar recebimento', e.client_name || shortTitle(e))}
    <label class="field"><span>Valor recebido (R$)</span><input class="money num" id="f-amount" inputmode="decimal" value="${moneyEdit(e.amount_cents)}"></label>
    <label class="field"><span>Data do recebimento</span><input type="date" id="f-date" value="${today()}"></label>
    ${splitField(e.split_mode || 'socios')}
    <div class="stack"><button class="btn green" data-action="recv-confirm">${icon('check', 20, 2.6)}Confirmar recebimento</button>
      <button class="btn sec" data-action="close-sheet">Cancelar</button></div>`);
}
const SPLIT_HINT = {
  socios: 'Repartido em 3 sem descontar as contas: cada sócio fica com 1/3 limpo; o terço do escritório paga as contas.',
  escritorio: 'Fica todo no caixa do escritório; não entra na divisão entre os sócios.',
};
function splitField(v) {
  return `<div class="field"><span>Divisão do valor</span>
    <div class="seg" id="f-split" data-value="${v}">
      <button type="button" data-seg="socios" class="${v === 'socios' ? 'on' : ''}">Dividir em 3</button>
      <button type="button" data-seg="escritorio" class="${v === 'escritorio' ? 'on' : ''}">Só do escritório</button>
    </div><div class="hint">${SPLIT_HINT[v]}</div></div>`;
}

function entrySheet(e) {
  editing = { ...e };
  const cats = e.kind === 'entrada' ? CAT_IN : CAT_OUT;
  const catOpts = [...cats, ...(cats.includes(e.category) ? [] : [e.category])].map(c => `<option ${c === e.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const isNew = e.id == null, paid = e.status === 'pago';
  openSheet(`${sheetHead(e, isNew ? 'Novo lançamento' : 'Editar lançamento', isNew ? (e.kind === 'entrada' ? 'Nova entrada' : 'Nova saída') : shortTitle(e))}
    ${isNew ? `<div class="field"><div class="seg" id="f-kind" data-value="${e.kind}">
      <button type="button" data-seg="entrada" class="${e.kind === 'entrada' ? 'on' : ''}">Entrada</button>
      <button type="button" data-seg="saida" class="${e.kind === 'saida' ? 'on' : ''}">Saída</button></div></div>` : ''}
    <label class="field"><span>Valor (R$)</span><input class="money num" id="f-amount" inputmode="decimal" placeholder="0,00" value="${e.amount_cents ? moneyEdit(e.amount_cents) : ''}"></label>
    <label class="field"><span>Descrição</span><input id="f-desc" value="${esc(e.description)}" autocomplete="off" placeholder="${e.kind === 'entrada' ? 'ex.: Honorários — Maria' : 'ex.: Hostgator'}"></label>
    <label class="field"><span>Categoria</span><select id="f-cat">${catOpts}</select></label>
    <label class="field"><span>${e.kind === 'entrada' ? 'Cliente' : 'Fornecedor / favorecido'}</span><input id="f-client" value="${esc(e.client_name || '')}" autocomplete="off"></label>
    <div class="field"><span>Status</span><div class="seg" id="f-status" data-value="${e.status}">
      <button type="button" data-seg="pago" class="${paid ? 'on' : ''}">${e.kind === 'entrada' ? 'Recebido' : 'Pago'}</button>
      <button type="button" data-seg="pendente" class="${!paid ? 'on' : ''}">Pendente</button></div></div>
    <label class="field"><span id="f-date-label">${paid ? (e.kind === 'entrada' ? 'Data do recebimento' : 'Data do pagamento') : 'Vencimento'}</span>
      <input type="date" id="f-date" value="${paid ? (e.paid_date || e.entry_date || today()) : (e.due_date || today())}"></label>
    ${e.kind === 'entrada' ? splitField(e.split_mode || 'socios') : ''}
    <label class="field"><span>Observações</span><textarea id="f-notes">${esc(e.notes || '')}</textarea></label>
    ${e.installment_total > 1 ? `<p class="hint">Parcela ${e.installment_number} de ${e.installment_total} — alterar este lançamento não muda as outras parcelas.</p>` : ''}
    <div class="stack">
      <button class="btn" data-action="save-entry">${icon('check', 20, 2.6)}Salvar</button>
      ${!isNew && paid ? `<button class="btn sec" data-action="reopen">${icon('undo', 18, 2.2)}Desfazer ${e.kind === 'entrada' ? 'recebimento' : 'pagamento'}</button>` : ''}
      ${!isNew ? `<button class="btn danger" data-action="delete">${icon('trash', 18, 2.2)}Excluir lançamento</button>` : ''}
      <button class="btn sec" data-action="close-sheet">Cancelar</button>
    </div>`);
}
function readEntryForm() {
  const e = { ...editing };
  const kindSeg = $('#f-kind'); if (kindSeg) e.kind = kindSeg.dataset.value;
  e.description = $('#f-desc').value;
  const a = parseMoney($('#f-amount').value); if (a === null || a <= 0) throw new Error('Informe um valor válido (ex.: 1.500,00).');
  e.category = $('#f-cat').value;
  e.client_name = $('#f-client').value.trim() || null;
  e.status = $('#f-status').dataset.value;
  const date = $('#f-date').value || today();
  if (e.amount_cents !== a && e.paid_cents != null) e.paid_cents = null;
  e.amount_cents = a;
  if (e.status === 'pago') { e.paid_date = date; if (!e.entry_date) e.entry_date = date; e.day_known = 1; }
  else { e.due_date = date; if (!e.entry_date) e.entry_date = today(); }
  const sp = $('#f-split'); if (e.kind === 'entrada' && sp) e.split_mode = sp.dataset.value; else if (e.kind === 'saida') e.split_mode = 'socios';
  e.notes = $('#f-notes').value.trim() || null;
  return e;
}
function readPartial() {
  const e = { ...editing };
  if ($('#f-desc')) e.description = $('#f-desc').value;
  const a = $('#f-amount') ? parseMoney($('#f-amount').value) : null; if (a) e.amount_cents = a;
  if ($('#f-client')) e.client_name = $('#f-client').value || null;
  return e;
}

function openingSheet() {
  const m = state.month, cur = opening(m), sug = suggestedOpening(m), prev = monthLabel(addMonths(m, -1)).toLowerCase();
  openSheet(`<div class="sheet-head"><div class="ic" style="width:46px;height:46px;border-radius:15px;background:rgba(46,125,91,.10);color:#2E7D5B">${icon('wallet', 24)}</div>
      <div><div class="eyebrow">Caixa do escritório</div><h2>Sobrou de ${esc(prev)}</h2></div></div>
    <p class="note">Quanto havia no caixa do escritório no fim de ${esc(prev)}. Não é receita: só abre o caixa de ${esc(monthLabel(m).toLowerCase())}.</p>
    <label class="field"><span>Valor (R$)</span><input class="money num" id="f-open" inputmode="decimal" placeholder="0,00" value="${cur === null ? '' : moneyEdit(cur)}"></label>
    ${sug !== null && cur === null ? `<div class="stack"><button class="btn sec" data-action="use-suggestion" data-v="${sug}">Usar o calculado: ${money(sug)}</button></div>` : ''}
    <div class="stack">
      <button class="btn green" data-action="save-opening">${icon('check', 20, 2.6)}Salvar</button>
      ${cur !== null ? `<button class="btn danger" data-action="remove-opening">${icon('trash', 18, 2.2)}Remover saldo lançado</button>` : ''}
      <button class="btn sec" data-action="close-sheet">Cancelar</button>
    </div>`);
}

// ───────────── Ações ─────────────

document.addEventListener('click', ev => {
  const segBtn = ev.target.closest('[data-seg]');
  if (segBtn) {
    const seg = segBtn.parentElement; seg.dataset.value = segBtn.dataset.seg;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === segBtn));
    if (seg.id === 'f-kind') { const e = readPartial(); e.kind = segBtn.dataset.seg; e.category = (e.kind === 'entrada' ? CAT_IN : CAT_OUT)[0]; entrySheet(e); }
    if (seg.id === 'f-status') {
      const paid = segBtn.dataset.seg === 'pago', k = editing && editing.kind;
      $('#f-date-label').textContent = paid ? (k === 'entrada' ? 'Data do recebimento' : 'Data do pagamento') : 'Vencimento';
    }
    if (seg.id === 'f-split') seg.nextElementSibling.textContent = SPLIT_HINT[segBtn.dataset.seg];
    return;
  }
  const filt = ev.target.closest('[data-filter]');
  if (filt) { state.caixaFilter = filt.dataset.filter; render(); return; }
  const tab = ev.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action;
  try {
    switch (a) {
      case 'prev-month': state.month = addMonths(state.month, -1); render(); break;
      case 'next-month': state.month = addMonths(state.month, 1); render(); break;
      case 'this-month': state.month = currentMonth(); render(); break;
      case 'pick-month': state.month = el.dataset.m; render(); break;
      case 'recv-group': state.recvGroup = el.dataset.g; render(); break;
      case 'new-entry': {
        const e = newEntry(state.tab === 'contas' ? 'saida' : 'entrada', state.month);
        if (state.tab === 'contas') { e.status = 'pendente'; e.due_date = e.entry_date; e.paid_date = null; }
        entrySheet(e); break;
      }
      case 'edit': entrySheet(findEntry(el.dataset.id)); break;
      case 'receive': receiveSheet(findEntry(el.dataset.id)); break;
      case 'recv-now': {
        const e = markPaid(editing, today(), null, el.dataset.split);
        closeSheet(); render(); toast(`Recebido ${money(e.amount_cents)} — ${el.dataset.split === 'socios' ? 'dividido em 3' : 'só do escritório'}`); break;
      }
      case 'recv-other': receiveOtherSheet(editing); break;
      case 'recv-confirm': {
        const v = parseMoney($('#f-amount').value); if (v === null || v <= 0) { toast('Valor inválido.'); break; }
        markPaid(editing, $('#f-date').value || today(), v, $('#f-split').dataset.value);
        closeSheet(); render(); toast('Recebimento registrado'); break;
      }
      case 'pay': { const e = findEntry(el.dataset.id); markPaid(e, today(), null, null); render(); toast('Conta paga: ' + money(e.amount_cents)); break; }
      case 'save-entry': saveEntry(readEntryForm()); closeSheet(); render(); toast('Lançamento salvo'); break;
      case 'reopen': reopen(editing); closeSheet(); render(); toast('Voltou a pendente'); break;
      case 'delete':
        if (confirm('Excluir “' + shortTitle(editing) + '”? Ele vai para a lixeira do caixa (pode ser restaurado no Mac).')) { trash(editing); closeSheet(); render(); toast('Lançamento excluído'); }
        break;
      case 'opening': openingSheet(); break;
      case 'use-suggestion': $('#f-open').value = moneyEdit(Number(el.dataset.v)); break;
      case 'save-opening': {
        const v = parseMoney($('#f-open').value); if (v === null) { toast('Valor inválido (ex.: 494,77).'); break; }
        setOpening(state.month, v); closeSheet(); render(); toast('Saldo do caixa lançado'); break;
      }
      case 'remove-opening': if (confirm('Remover o saldo lançado?')) { setOpening(state.month, null); closeSheet(); render(); } break;
      case 'save-icloud': saveToICloud(); break;
      case 'pick-file': pickFromICloud(); break;
      case 'confirm-load': confirmLoad(); break;
      case 'undo-load': if (confirm('Voltar para os dados que estavam aqui antes da última carga?')) undoLoad(); break;
      case 'close-sheet': closeSheet(); break;
    }
  } catch (err) { toast(err.message || String(err)); }
});
$('#sheet-backdrop').addEventListener('click', closeSheet);
// Tela estática: bloqueia o zoom de pinça (gestos do Safari) e o de toque duplo.
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.getElementById('file-input').addEventListener('change', ev => onFilePicked(ev.target.files[0]));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
