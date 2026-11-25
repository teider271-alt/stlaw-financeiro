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

const state = { tab: 'inicio', month: currentMonth() };
const $ = s => document.querySelector(s);
let toastTimer = null;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
function updateDirty() { $('#dirty').hidden = !isDirty(); }

function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  const showMonth = ['inicio', 'caixa', 'contas'].includes(state.tab) && hasData();
  $('#monthbar').hidden = !showMonth;
  $('#month-label').innerHTML = esc(monthLabel(state.month)) + (state.month === currentMonth() ? '<small>este mês</small>' : '');
  $('#fab').hidden = !(hasData() && ['inicio', 'caixa', 'contas'].includes(state.tab));
  updateDirty();
  const v = $('#view');
  if (!hasData() && state.tab !== 'icloud') { v.innerHTML = emptyView(); return; }
  v.innerHTML = ({ inicio: homeView, caixa: cashView, contas: billsView, receber: receivablesView, icloud: syncView }[state.tab])();
}

function emptyView() {
  return `<div class="card">
    <div class="title">Bem-vindo</div>
    <p class="note">Este app ainda não tem dados. Para começar, envie o financeiro do Mac e carregue aqui:</p>
    <ol class="steps">
      <li>No Mac, abra o S&amp;T LAW e clique em <b>iPhone › Enviar para o iPhone</b>.</li>
      <li>Aqui, toque em <b>Carregar do iCloud Drive</b> e escolha <b>iCloud Drive › S&amp;T LAW › stlaw-financeiro.json</b>.</li>
    </ol>
    <div class="stack"><button class="btn" data-action="pick-file">Carregar do iCloud Drive</button></div>
  </div>`;
}

function recvRow(e) {
  const late = displayStatus(e) === 'atrasado';
  const n = e.installment_total > 1 ? `<span class="badge">${e.installment_number}/${e.installment_total}</span>` : '';
  return `<div class="row">
    <div class="main"><div class="t"><span class="nm">${esc(shortTitle(e))}</span>${n}</div>
      <div class="s ${late ? 'red' : ''}">${late ? 'atrasado · venceu ' : 'vence '}${br(e.due_date)}</div></div>
    <div class="amt">${money(e.amount_cents)}</div>
    <button class="btn pill green" data-action="receive" data-id="${e.id}">Recebi</button>
  </div>`;
}
function entryRow(e) {
  const kind = e.kind === 'entrada' ? 'in' : 'out';
  const n = e.installment_total > 1 ? `<span class="badge">${e.installment_number}/${e.installment_total}</span>` : '';
  const office = e.kind === 'entrada' && e.split_mode === 'escritorio' ? '<span class="badge esc">escritório</span>' : '';
  const date = e.status === 'pendente' ? 'vence ' + brShort(e.due_date) : (e.day_known ? brShort(e.paid_date || e.entry_date) : 'no mês');
  return `<button class="row" data-action="edit" data-id="${e.id}">
    <div class="main"><div class="t"><span class="nm">${esc(shortTitle(e))}</span>${n}${office}</div><div class="s">${esc(e.category)} · ${date}</div></div>
    <div class="amt ${kind}">${e.kind === 'entrada' ? '+' : '−'} ${money(eff(e))}</div>
  </button>`;
}

function homeView() {
  const m = state.month, name = monthName(m), prev = monthName(addMonths(m, -1)).toLowerCase();
  const ind = indicators(m), d = division(m), c = officeCash(m), rec = toReceive(m);
  const shareRows = PARTNERS.map(p => `<div class="share"><div class="avatar azul">${esc(p[0])}</div>
      <div class="who"><b>${esc(p)}</b><small>sócio · 1/3 limpo</small></div><div class="val">${money(d.socio)}</div></div>`).join('');
  return `
  <div class="card">
    <div class="card-head"><div class="title">Saldo do mês <i>${name}</i></div></div>
    <div class="big ${ind.saldo < 0 ? 'vermelho' : ''}">${bigMoney(ind.saldo)}</div>
    <div class="split2">
      <div class="mini"><div class="label">Entrou</div><div class="v azul">${money(ind.entradas)}</div></div>
      <div class="mini"><div class="label">Saiu</div><div class="v laranja">${money(ind.saidas)}</div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><div class="title">Divisão do resultado <i>${name}</i></div></div>
    <div class="big">${bigMoney(d.dividido)}</div>
    <div class="note">entradas para dividir em 3, sem descontar as contas</div>
    ${shareRows}
    <div class="share"><div class="avatar ${d.saldoEscritorio < 0 ? 'vermelho' : 'verde'}">E</div>
      <div class="who"><b>Escritório</b><small>resultado do mês · paga as contas</small></div><div class="val">${money(d.saldoEscritorio)}</div></div>
    <div class="calc">
      <div class="r"><span>1/3 do escritório</span><span>${money(d.tercoEscritorio)}</span></div>
      ${d.integral ? `<div class="r"><span>+ entradas integrais do escritório</span><span>${money(d.integral)}</span></div>` : ''}
      <div class="r"><span>− contas pagas no mês</span><span>${money(-d.contas)}</span></div>
      <div class="r b ${d.saldoEscritorio < 0 ? 'neg' : ''}"><span>= resultado do escritório</span><span>${money(d.saldoEscritorio)}</span></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><div class="title">Caixa do escritório <i>${name}</i></div></div>
    <div class="big ${c.closing < 0 ? 'vermelho' : 'verde'}">${bigMoney(c.closing)}</div>
    <div class="note">${c.opening === null ? `resultado do mês — falta lançar o saldo de ${prev}` : `o que fica no caixa no fim de ${name.toLowerCase()}`}</div>
    <div class="calc">
      <div class="r"><span>Saldo que sobrou de ${prev}</span><span>${c.opening === null ? '<b class="note red">não lançado</b>' : money(c.opening)}</span></div>
      <div class="r"><span>+ resultado do escritório</span><span>${money(d.saldoEscritorio)}</span></div>
      <div class="r b"><span>= em caixa</span><span>${money(c.closing)}</span></div>
    </div>
    <div class="stack"><button class="btn sec" data-action="opening">${c.opening === null ? 'Lançar' : 'Alterar'} saldo de ${prev}</button></div>
  </div>
  <div class="card flush">
    <div class="card-head"><div class="title">A receber <i>${name}</i></div><span class="chip">${money(sum(rec, e => e.amount_cents))}</span></div>
    ${rec.length ? rec.map(recvRow).join('') : '<div class="empty">Nada pendente para este mês.</div>'}
  </div>`;
}

function cashView() {
  const m = state.month, ins = ledger(m, 'entrada').filter(e => e.status === 'pago'), outs = ledger(m, 'saida').filter(e => e.status === 'pago');
  const rec = toReceive(m);
  const byDate = (a, b) => (b.paid_date || b.entry_date || '').localeCompare(a.paid_date || a.entry_date || '');
  return `
  ${rec.length ? `<div class="card flush">
    <div class="card-head"><div class="title">A receber</div><span class="chip">${money(sum(rec, e => e.amount_cents))}</span></div>
    <div class="empty" style="padding-top:0;padding-bottom:8px">Ainda não entrou no caixa. Ao receber, toque em “Recebi” e escolha a divisão.</div>
    ${rec.map(recvRow).join('')}</div>` : ''}
  <div class="card flush">
    <div class="card-head"><div class="title">Entradas</div><span class="chip">${money(sum(ins))}</span></div>
    ${ins.length ? ins.sort(byDate).map(entryRow).join('') : '<div class="empty">Nenhuma entrada neste mês.</div>'}
  </div>
  <div class="card flush">
    <div class="card-head"><div class="title">Saídas</div><span class="chip saida">${money(sum(outs))}</span></div>
    ${outs.length ? outs.sort(byDate).map(entryRow).join('') : '<div class="empty">Nenhuma saída neste mês.</div>'}
  </div>`;
}

function billsView() {
  const m = state.month, outs = ledger(m, 'saida');
  const open = outs.filter(e => e.status === 'pendente').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const paid = outs.filter(e => e.status === 'pago');
  const openRow = e => {
    const late = displayStatus(e) === 'atrasado';
    return `<div class="row">
      <button class="dot ${late ? 'late' : ''}" data-action="pay" data-id="${e.id}" aria-label="Marcar como paga"></button>
      <button class="main" data-action="edit" data-id="${e.id}" style="text-align:left"><div class="t">${esc(shortTitle(e))}</div>
        <div class="s ${late ? 'red' : ''}">${late ? 'atrasada · venceu ' : 'vence '}${br(e.due_date)}</div></button>
      <div class="amt">${money(e.amount_cents)}</div></div>`;
  };
  return `
  <div class="kpis">
    <div class="kpi"><div class="label">Em aberto</div><div class="v ${open.length ? 'red' : 'verde'}">${money(sum(open, e => e.amount_cents))}</div></div>
    <div class="kpi"><div class="label">Pagas no mês</div><div class="v">${money(sum(paid))}</div></div>
  </div>
  <div class="card flush">
    <div class="card-head"><div class="title">Contas a pagar</div><span class="chip saida">${open.length}</span></div>
    ${open.length ? open.map(openRow).join('') : '<div class="empty">Nenhuma conta em aberto neste mês. Toque em + para lançar.</div>'}
  </div>
  <div class="card flush">
    <div class="card-head"><div class="title">Pagas</div><span class="chip saida">${money(sum(paid))}</span></div>
    ${paid.length ? paid.map(entryRow).join('') : '<div class="empty">Nenhuma conta paga neste mês.</div>'}
  </div>`;
}

function receivablesView() {
  const pend = pendingIn();
  const parcelPlans = db.data.finance_plans.filter(p => p.plan_type === 'parcelamento' && p.kind === 'entrada' && p.active);
  const parcelIds = new Set(parcelPlans.map(p => p.id));
  const maint = pend.filter(e => e.category === MANUT);
  const months = [...new Set(maint.map(e => (e.due_date || 'sem data').slice(0, 7)))].sort();
  const sucumb = pend.filter(e => e.category === SUCUMB);
  const others = pend.filter(e => e.category !== MANUT && e.category !== SUCUMB && !parcelIds.has(e.plan_id));
  const late = pend.filter(e => displayStatus(e) === 'atrasado');
  const thisMonth = pend.filter(e => (e.due_date || '').startsWith(currentMonth()));
  const simpleRow = (e, sub) => `<div class="row"><div class="main"><div class="t">${esc(e.client_name || shortTitle(e))}</div>
      <div class="s ${displayStatus(e) === 'atrasado' ? 'red' : ''}">${esc(sub)}</div></div>
      <div class="amt">${money(e.amount_cents)}</div>
      <button class="btn pill sec" data-action="receive" data-id="${e.id}">Receber</button></div>`;
  const maintCards = months.map(ym => {
    const list = maint.filter(e => (e.due_date || 'sem data').slice(0, 7) === ym)
      .sort((a, b) => ((a.due_date || '') + (a.client_name || '')).localeCompare((b.due_date || '') + (b.client_name || '')));
    return `<div class="card flush"><div class="card-head"><div class="title">Taxas de manutenção <i>${ym === 'sem data' ? 'sem vencimento' : monthLabel(ym)}</i></div>
      <span class="chip">${money(sum(list, e => e.amount_cents))}</span></div>
      <div class="empty" style="padding-top:0;padding-bottom:8px">${list.length} cliente(s)</div>
      ${list.map(e => simpleRow(e, 'vence ' + br(e.due_date))).join('')}</div>`;
  }).join('');
  const plans = parcelPlans.map(p => {
    const list = planEntries(p.id), paid = list.filter(e => e.status === 'pago'), open = list.filter(e => e.status === 'pendente');
    return { p, list, paid, open, remaining: sum(open, e => e.amount_cents), next: open[0], overdue: open.filter(e => displayStatus(e) === 'atrasado').length };
  }).filter(x => x.remaining > 0);
  const planRows = plans.map(x => `<div class="row" style="flex-wrap:wrap">
      <div class="main"><div class="t">${esc(x.p.client_name || x.p.description)}</div>
        <div class="s ${x.overdue ? 'red' : ''}">${x.paid.length} de ${x.list.length} pagas${x.next && x.next.due_date ? ' · próxima ' + br(x.next.due_date) : ''}</div></div>
      <div class="amt">${money(x.remaining)}</div>
      ${x.next ? `<button class="btn pill sec" data-action="receive" data-id="${x.next.id}">Receber</button>` : ''}
      <div class="progress" style="flex-basis:100%"><span style="width:${Math.round(100 * x.paid.length / Math.max(1, x.list.length))}%"></span></div>
    </div>`).join('');
  return `
  <div class="kpis">
    <div class="kpi"><div class="label">Total a receber</div><div class="v azul">${money(sum(pend, e => e.amount_cents))}</div></div>
    <div class="kpi"><div class="label">Em atraso</div><div class="v ${late.length ? 'red' : 'verde'}">${money(sum(late, e => e.amount_cents))}</div></div>
    <div class="kpi"><div class="label">Vence em ${monthName(currentMonth()).toLowerCase()}</div><div class="v">${money(sum(thisMonth, e => e.amount_cents))}</div></div>
    <div class="kpi"><div class="label">Sucumbências</div><div class="v">${money(sum(sucumb, e => e.amount_cents))}</div></div>
  </div>
  ${maintCards}
  <div class="card flush"><div class="card-head"><div class="title">Sucumbências esperadas</div><span class="chip">${money(sum(sucumb, e => e.amount_cents))}</span></div>
    <div class="empty" style="padding-top:0;padding-bottom:8px">Valores estimados e sem data.</div>
    ${sucumb.map(e => simpleRow(e, e.notes || 'estimativa')).join('') || '<div class="empty">Nenhuma sucumbência pendente.</div>'}</div>
  <div class="card flush"><div class="card-head"><div class="title">Parcelamento de honorários iniciais</div><span class="chip">${money(sum(plans, x => x.remaining))}</span></div>
    ${planRows || '<div class="empty">Nenhum parcelamento em aberto.</div>'}</div>
  ${others.length ? `<div class="card flush"><div class="card-head"><div class="title">Outros a receber</div><span class="chip">${money(sum(others, e => e.amount_cents))}</span></div>
    ${others.map(e => simpleRow(e, (e.due_date ? 'vence ' + br(e.due_date) + ' · ' : '') + e.category)).join('')}</div>` : ''}`;
}

function syncView() {
  const dirty = isDirty(), prev = readJSON(PREV);
  return `
  <div class="card">
    <div class="title">iCloud Drive</div>
    <p class="note">A troca com o Mac é por um arquivo na pasta <b>iCloud Drive › S&amp;T LAW</b>. Nada sai daqui sem você salvar.</p>
    <div class="status-line"><span class="led ${dirty ? 'warn' : ''}"></span>${dirty ? 'Há alterações neste iPhone ainda não salvas no iCloud' : (hasData() ? 'Tudo salvo no iCloud' : 'Sem dados neste iPhone')}</div>
    <div class="note">${esc(db.meta.when || 'Ainda não houve troca com o Mac.')}</div>
    <div class="stack">
      <button class="btn" data-action="save-icloud" ${hasData() ? '' : 'disabled'}>Salvar no iCloud Drive</button>
      <button class="btn sec" data-action="pick-file">Carregar do iCloud Drive</button>
    </div>
  </div>
  <div class="card">
    <div class="title">Como usar</div>
    <ol class="steps">
      <li><b>Atualizou no iPhone?</b> Toque em <b>Salvar no iCloud Drive</b> › <b>Salvar em Arquivos</b> › iCloud Drive › <b>S&amp;T LAW</b> › Salvar (substituir). Ao abrir o app no Mac, ele puxa sozinho.</li>
      <li><b>Atualizou no Mac?</b> No Mac clique em <b>iPhone › Enviar para o iPhone</b>. Aqui, toque em <b>Carregar do iCloud Drive</b> e escolha <b>stlaw-financeiro.json</b>.</li>
      <li>Use um aparelho por vez: salve antes de trocar de aparelho.</li>
    </ol>
  </div>
  ${prev ? `<div class="card"><div class="title">Desfazer</div>
    <p class="note">Volta para os dados que estavam aqui antes da última carga.</p>
    <div class="stack"><button class="btn danger" data-action="undo-load">Voltar para a versão anterior</button></div></div>` : ''}`;
}

// ───────────── Folhas (formulários) ─────────────

function openSheet(html) {
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
  $('#sheet').scrollTop = 0;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; $('#sheet').innerHTML = ''; editing = null; }
let editing = null;
const findEntry = id => db.data.finance_entries.find(e => e.id === Number(id));

function receiveSheet(e) {
  editing = e;
  openSheet(`
    <div class="eyebrow">Registrar recebimento</div>
    <h2>${esc(shortTitle(e))}</h2>
    <p class="note">${money(e.amount_cents)}${e.due_date ? ' · vence ' + br(e.due_date) : ''}</p>
    <div class="stack">
      <button class="btn" data-action="recv-now" data-split="socios">Recebi hoje — dividir em 3</button>
      <button class="btn green" data-action="recv-now" data-split="escritorio">Recebi hoje — integral do escritório</button>
      <button class="btn sec" data-action="recv-other">Outra data ou valor…</button>
    </div>`);
}
function receiveOtherSheet(e) {
  editing = e;
  openSheet(`
    <div class="eyebrow">Registrar recebimento</div>
    <h2>${esc(shortTitle(e))}</h2>
    <label class="field"><span>Data do recebimento</span><input type="date" id="f-date" value="${today()}"></label>
    <label class="field"><span>Valor recebido (R$)</span><input id="f-amount" inputmode="decimal" value="${moneyEdit(e.amount_cents)}"></label>
    ${splitField(e.split_mode || 'socios')}
    <div class="stack">
      <button class="btn" data-action="recv-confirm">Confirmar recebimento</button>
      <button class="btn sec" data-action="close-sheet">Cancelar</button>
    </div>`);
}
function splitField(v) {
  return `<div class="field"><span>Divisão do valor</span>
    <div class="seg" id="f-split" data-value="${v}">
      <button type="button" data-seg="socios" class="${v === 'socios' ? 'on' : ''}">Dividir em 3</button>
      <button type="button" data-seg="escritorio" class="${v === 'escritorio' ? 'on' : ''}">Integral do escritório</button>
    </div>
    <div class="hint">${v === 'socios' ? 'Repartido em 3 sem descontar as contas: cada sócio fica com 1/3 limpo; o terço do escritório paga as contas.' : 'Fica todo no caixa do escritório; não entra na divisão entre os sócios.'}</div></div>`;
}

function entrySheet(e) {
  editing = { ...e };
  const cats = e.kind === 'entrada' ? CAT_IN : CAT_OUT;
  const catOpts = [...cats, ...(cats.includes(e.category) ? [] : [e.category])].map(c => `<option ${c === e.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const isNew = e.id == null, paid = e.status === 'pago';
  openSheet(`
    <div class="eyebrow">${isNew ? 'Novo lançamento' : 'Editar lançamento'}</div>
    <h2>${isNew ? (e.kind === 'entrada' ? 'Nova entrada' : 'Nova saída') : esc(shortTitle(e))}</h2>
    ${isNew ? `<div class="field"><div class="seg" id="f-kind" data-value="${e.kind}">
      <button type="button" data-seg="entrada" class="${e.kind === 'entrada' ? 'on' : ''}">Entrada</button>
      <button type="button" data-seg="saida" class="${e.kind === 'saida' ? 'on' : ''}">Saída</button></div></div>` : ''}
    <label class="field"><span>Descrição *</span><input id="f-desc" value="${esc(e.description)}" autocomplete="off"></label>
    <label class="field"><span>Valor (R$) *</span><input id="f-amount" inputmode="decimal" placeholder="0,00" value="${e.amount_cents ? moneyEdit(e.amount_cents) : ''}"></label>
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
      <button class="btn" data-action="save-entry">Salvar</button>
      ${!isNew && paid ? `<button class="btn sec" data-action="reopen">Desfazer ${e.kind === 'entrada' ? 'recebimento' : 'pagamento'} (volta a pendente)</button>` : ''}
      ${!isNew ? '<button class="btn danger" data-action="delete">Excluir lançamento</button>' : ''}
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

function openingSheet() {
  const m = state.month, cur = opening(m), sug = suggestedOpening(m), prev = monthLabel(addMonths(m, -1));
  openSheet(`
    <div class="eyebrow">Caixa do escritório</div>
    <h2>Saldo que sobrou de ${esc(prev.toLowerCase())}</h2>
    <p class="note">Quanto havia no caixa do escritório no fim de ${esc(prev.toLowerCase())}. Não é receita: só abre o caixa de ${esc(monthLabel(m).toLowerCase())}.</p>
    <label class="field"><span>Valor (R$)</span><input id="f-open" inputmode="decimal" placeholder="0,00" value="${cur === null ? '' : moneyEdit(cur)}"></label>
    ${sug !== null && cur === null ? `<div class="stack"><button class="btn sec" data-action="use-suggestion" data-v="${sug}">Usar o que o app calculou: ${money(sug)}</button></div>` : ''}
    <div class="stack">
      <button class="btn" data-action="save-opening">Salvar</button>
      ${cur !== null ? '<button class="btn danger" data-action="remove-opening">Remover saldo lançado</button>' : ''}
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
    if (seg.id === 'f-split') {
      seg.nextElementSibling.textContent = segBtn.dataset.seg === 'socios'
        ? 'Repartido em 3 sem descontar as contas: cada sócio fica com 1/3 limpo; o terço do escritório paga as contas.'
        : 'Fica todo no caixa do escritório; não entra na divisão entre os sócios.';
    }
    return;
  }
  const tab = ev.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = ev.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action;
  try {
    switch (a) {
      case 'prev-month': state.month = addMonths(state.month, -1); render(); break;
      case 'next-month': state.month = addMonths(state.month, 1); render(); break;
      case 'this-month': state.month = currentMonth(); render(); break;
      case 'new-entry': entrySheet(newEntry(state.tab === 'contas' ? 'saida' : 'entrada', state.month)); if (state.tab === 'contas') { $('#f-status [data-seg=pendente]').click(); } break;
      case 'edit': entrySheet(findEntry(el.dataset.id)); break;
      case 'receive': receiveSheet(findEntry(el.dataset.id)); break;
      case 'recv-now': {
        const e = markPaid(editing, today(), null, el.dataset.split);
        closeSheet(); render(); toast(`Recebido: ${money(e.amount_cents)} — ${el.dataset.split === 'socios' ? 'dividido em 3' : 'integral do escritório'}`); break;
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
function readPartial() {
  const e = { ...editing };
  e.description = $('#f-desc') ? $('#f-desc').value : e.description;
  const a = $('#f-amount') ? parseMoney($('#f-amount').value) : null; if (a) e.amount_cents = a;
  e.client_name = $('#f-client') ? ($('#f-client').value || null) : e.client_name;
  return e;
}
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.getElementById('file-input').addEventListener('change', ev => onFilePicked(ev.target.files[0]));

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
render();
