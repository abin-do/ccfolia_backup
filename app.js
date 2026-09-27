'use strict';

/* =========================================================
 * 상태
 * ========================================================= */
const SKIP = 'skip';
const STORE_KEY = 'ccfolia-log-converter:chars';
const OPT_KEY = 'ccfolia-log-converter:opts-v2';
const TYPE_KEY = 'ccfolia-log-converter:types-v2';
const OLD_TYPE_KEY = 'ccfolia-log-converter:types'; // 예전 '내 분류' (옮겨 오기용)
const SAMPLE = { name: '이름', text: '예시 대사입니다.', paren: '예시 대사입니다. (괄호 속 글)' };

const PRESETS = {
  light: { bg: '#ffffff', text: '#1f1f1f', narr: '#1f1f1f', dim: '#8a8a8e', line: '#e6e6e9' },
  dark: { bg: '#3a3a3c', text: '#f2f2f4', narr: '#bdbdc2', dim: '#a1a1a6', line: '#4f4f53' },
};

/** 글꼴 종류. 고른 글꼴이 보는 사람 컴퓨터에 없을 때 대신 쓸 글꼴 묶음이기도 하다 */
const FONT_GROUPS = {
  gothic: { label: '고딕', stack: "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif" },
  myeongjo: { label: '명조', stack: "'AppleMyungjo','Batang','Noto Serif KR',serif" },
  serif: { label: '세리프 (영문)', stack: "'Georgia','Times New Roman','AppleMyungjo','Batang',serif" },
  hand: { label: '손글씨', stack: "'Nanum Pen Script','Gaegu',cursive" },
  mono: { label: '고정폭', stack: "'D2Coding','Nanum Gothic Coding','Consolas',monospace" },
};

/**
 * 기본 글꼴 목록. id가 @로 시작하면 특정 글꼴 없이 종류의 기본 글꼴을 쓴다.
 * web에 값이 있으면 구글 폰트에서 불러오며, 그 값은 불러올 굵기다.
 */
const FONTS = [
  { id: '', name: '', label: '기본 고딕', group: 'gothic' },
  { id: 'Malgun Gothic', label: '맑은 고딕', group: 'gothic' },
  { id: 'Noto Sans KR', label: 'Noto Sans KR', group: 'gothic', web: ':wght@400;700' },
  { id: 'Nanum Gothic', label: '나눔고딕', group: 'gothic', web: ':wght@400;700' },
  { id: 'Gowun Dodum', label: '고운돋움', group: 'gothic', web: '' },
  { id: '@myeongjo', name: '', label: '기본 명조', group: 'myeongjo' },
  { id: 'Noto Serif KR', label: 'Noto Serif KR', group: 'myeongjo', web: ':wght@400;700' },
  { id: 'Nanum Myeongjo', label: '나눔명조', group: 'myeongjo', web: ':wght@400;700' },
  { id: 'Gowun Batang', label: '고운바탕', group: 'myeongjo', web: ':wght@400;700' },
  { id: 'Batang', label: '바탕 (Windows)', group: 'myeongjo' },
  { id: 'Gungsuh', label: '궁서 (Windows)', group: 'myeongjo' },
  { id: '@serif', name: '', label: '기본 세리프', group: 'serif' },
  { id: 'Georgia', label: 'Georgia', group: 'serif' },
  { id: 'Times New Roman', label: 'Times New Roman', group: 'serif' },
  { id: 'Playfair Display', label: 'Playfair Display', group: 'serif', web: ':wght@400;700' },
  { id: 'Nanum Pen Script', label: '나눔손글씨 펜', group: 'hand', web: '' },
  { id: 'Gaegu', label: '개구', group: 'hand', web: ':wght@400;700' },
  { id: '@mono', name: '', label: '기본 고정폭', group: 'mono' },
  { id: 'Nanum Gothic Coding', label: '나눔고딕코딩', group: 'mono', web: ':wght@400;700' },
].map((f) => ({ name: f.id, ...f }));
const FONT_KEY = 'ccfolia-log-converter:fonts';

const DEFAULT_OPTS = {
  ...PRESETS.light,
  nameColor: 'text',
  avatar: 48,
  radius: '12',
  font: 10,
  fontFamily: '',
  fontCustom: '',
  merge: true,
  dice: true,
  divider: true,
};

/**
 * 분류. kind가 char면 얼굴·이름·대사, narr면 대사만 나온다.
 * color / parenColor가 비어 있으면 3단계의 테마 색을 따른다. size는 3단계 글자 크기 대비 %.
 */
const BASE_TYPE = {
  label: '새 분류', kind: 'narr',
  bold: false, italic: false, underline: false, strike: false, align: '',
  color: '', size: 100, dimParen: false, parenColor: '',
};
const DEFAULT_TYPES = [
  { ...BASE_TYPE, id: 'char', label: '인물', kind: 'char', dimParen: true },
  { ...BASE_TYPE, id: 'bold', label: '굵은 지문', bold: true },
  { ...BASE_TYPE, id: 'thin', label: '얇은 지문' },
];

const state = {
  fileName: 'log',
  sourceHtml: '', // 마지막으로 해석한 원문 (같으면 다시 해석하지 않아 수정 내용을 지킨다)
  messages: [],   // {name, text, color, html, origHtml, deleted}
  tab: 'preview', // 3단계 오른쪽 화면: preview | edit
  names: [],      // 등장 순서대로 화자 이름
  chars: {},      // name -> {type, display, color, img}
  types: [],      // 분류 목록 (BASE_TYPE 모양 + id)
  userFonts: [],  // 사용자가 추가한 글꼴 {id, name, label, group, google}
  charFilter: 'all', // 2단계 화자 목록 보기: all | char | narr | skip
  editingType: null, // 2단계에서 설정 창이 열린 분류 id
  opts: { ...DEFAULT_OPTS },
};

const $ = (sel) => document.querySelector(sel);

/* =========================================================
 * 저장소 (없어도 동작하도록 try/catch)
 * ========================================================= */
function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 용량 초과 등은 무시 */ }
}
function saveChars() {
  const saved = loadJSON(STORE_KEY) || {};
  Object.assign(saved, state.chars);
  saveJSON(STORE_KEY, saved);
}
function saveTypes() { saveJSON(TYPE_KEY, state.types); }

function loadTypes() {
  const saved = loadJSON(TYPE_KEY);
  if (Array.isArray(saved) && saved.some((t) => t && t.id)) {
    return saved.filter((t) => t && t.id).map((t) => ({ ...BASE_TYPE, ...t }));
  }
  // 처음 쓰거나 예전 버전에서 넘어온 경우: 기본 분류 + 예전 '내 분류'
  const types = DEFAULT_TYPES.map((t) => ({ ...t }));
  const old = loadJSON(OLD_TYPE_KEY);
  if (Array.isArray(old)) for (const t of old) if (t && t.id) types.push({ ...BASE_TYPE, ...t, kind: 'narr' });
  const oldOpts = loadJSON(OPT_KEY);
  if (oldOpts && oldOpts.dimParen === false) types[0].dimParen = false;
  return types;
}

/* =========================================================
 * 분류
 * ========================================================= */
const typeById = (id) => state.types.find((t) => t.id === id);
const isKnownType = (id) => id === SKIP || !!typeById(id);
const isCharType = (id) => { const t = typeById(id); return !!t && t.kind === 'char'; };
const usersOf = (id) => state.names.filter((n) => state.chars[n] && state.chars[n].type === id).length;

function typeLabel(id) {
  if (id === SKIP) return '제외';
  const t = typeById(id);
  return t ? (t.label || '(이름 없는 분류)') : '(삭제된 분류)';
}

/** 드롭다운 순서: 분류 카드 순서 그대로, 마지막에 제외 */
function typeOptions() {
  return [...state.types.map((t) => [t.id, t.label || '(이름 없는 분류)']), [SKIP, '제외']];
}

/** 없는 분류를 가리키면 비슷한 분류로 바꾼다 */
function resolveType(id) {
  if (isKnownType(id)) return id;
  if (id === 'char') {
    const c = state.types.find((t) => t.kind === 'char');
    if (c) return c.id;
  }
  const narr = typeById('thin') || state.types.find((t) => t.kind === 'narr') || state.types[0];
  return narr ? narr.id : SKIP;
}

/** 대사 글자 모양 (정렬·크기·색·굵기 등) */
function textCss(t, o) {
  const deco = [t.underline && 'underline', t.strike && 'line-through'].filter(Boolean).join(' ') || 'none';
  const size = Math.round(o.font * (t.size || 100) / 10) / 10;
  const align = t.align || (t.kind === 'char' ? 'left' : 'center');
  const color = t.color || (t.kind === 'char' ? o.text : o.narr);
  return `text-align:${align};font-size:${size}px;color:${color};`
    + `font-weight:${t.bold ? 700 : 400};font-style:${t.italic ? 'italic' : 'normal'};text-decoration:${deco};`;
}

/* =========================================================
 * 파싱
 * ========================================================= */
function parseLog(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  doc.querySelectorAll('p').forEach((p) => {
    const spans = [...p.children].filter((el) => el.tagName === 'SPAN');
    if (spans.length < 3) return;
    const name = spans[1].textContent.trim();
    const body = spans[2];
    body.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    const text = body.textContent.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').replace(/[ \t]+\n/g, '\n');
    if (!text.trim()) return;
    const m = (p.getAttribute('style') || '').match(/color\s*:\s*(#[0-9a-f]{3,8})/i);
    out.push({ name, text, color: m ? normalizeHex(m[1]) : '' });
  });
  return out;
}

function normalizeHex(hex) {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h.slice(0, 6);
}

/** 이름만 보고 대략적인 분류를 추측 */
function guessType(name) {
  const n = name.replace(/[\sㅤᅟᅠ​　]/g, '');
  if (!n) return 'thin';
  if (/^(system|dice)$/i.test(n)) return 'thin';
  if (/system|시스템|[『』【】〔〕]/i.test(n)) return 'bold';
  if (!/[\p{L}\p{N}]/u.test(n)) return 'thin';
  return 'char';
}

function displayLabel(name) {
  const n = name.replace(/[\sㅤᅟᅠ​　]/g, '');
  return n ? name : '(빈 이름)';
}

/* =========================================================
 * 1단계
 * ========================================================= */
function readFile(file) {
  if (!file) return;
  state.fileName = file.name.replace(/\.html?$/i, '') || 'log';
  const reader = new FileReader();
  reader.onload = () => {
    $('#pasteInput').value = reader.result;
    $('#parseStatus').textContent = `불러옴: ${file.name}`;
  };
  reader.readAsText(file, 'utf-8');
}

function handleParse() {
  const html = $('#pasteInput').value;
  if (!html.trim()) { toast('로그 HTML을 먼저 넣어 주십시오'); return; }
  // 같은 로그로 다시 넘어오면 3단계에서 고친 대사를 그대로 둔다
  if (html === state.sourceHtml && state.messages.length) { renderStep2(); go(2); return; }

  const messages = parseLog(html);
  if (!messages.length) { toast('메시지를 찾지 못했습니다. 코코포리아 로그 형식이 맞는지 확인해 주십시오'); return; }
  for (const m of messages) {
    m.html = m.origHtml = textToHtml(m.text);
    m.deleted = false;
  }

  state.sourceHtml = html;
  state.messages = messages;
  state.names = [...new Set(messages.map((m) => m.name))];

  const saved = loadJSON(STORE_KEY) || {};
  const chars = {};
  for (const name of state.names) {
    const first = messages.find((m) => m.name === name);
    chars[name] = state.chars[name] || saved[name] || {
      type: guessType(name),
      display: name,
      color: first.color || '#333333',
      img: '',
    };
    // 지운 분류를 쓰던 화자는 비슷한 분류로 옮긴다
    chars[name].type = resolveType(chars[name].type);
  }
  state.chars = chars;
  renderStep2();
  go(2);
}

/* =========================================================
 * 2단계
 * ========================================================= */
function renderStep2() {
  renderTypeCards();
  renderTypePanel();
  renderCharList();
}

function renderCharList() {
  const list = $('#charList');
  list.innerHTML = '';
  for (const name of state.names) list.append(buildCharRow(name));
  applyCharFilter();
}

/** 화자가 어느 묶음에 드는지: 인물형 분류면 char, 지문형이면 narr, 제외면 skip */
function charGroup(name) {
  const c = state.chars[name];
  if (!c || c.type === SKIP) return 'skip';
  return isCharType(c.type) ? 'char' : 'narr';
}

function applyCharFilter() {
  const f = state.charFilter;
  let shown = 0;
  document.querySelectorAll('#charList .char-row').forEach((row) => {
    const ok = f === 'all' || charGroup(row.dataset.name) === f;
    row.hidden = !ok;
    if (ok) shown++;
  });
  let empty = $('#charList .char-empty');
  if (!shown) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'char-empty';
      $('#charList').append(empty);
    }
    empty.textContent = '이 묶음에 든 화자가 없습니다';
  } else if (empty) empty.remove();
  updateCharFilterCounts();
}

/** 묶음별 인원만 새로 센다. 드롭다운을 바꾼 화자가 바로 사라지지 않도록 목록은 다시 거르지 않는다 */
function updateCharFilterCounts() {
  const counts = { all: state.names.length, char: 0, narr: 0, skip: 0 };
  for (const n of state.names) counts[charGroup(n)]++;
  document.querySelectorAll('#charFilter [data-f]').forEach((b) => {
    b.classList.toggle('on', b.dataset.f === state.charFilter);
    b.querySelector('.n').textContent = counts[b.dataset.f];
  });
}

/* ---------- 분류 카드 ---------- */
/** 분류 모양을 실제 출력과 같은 코드로 그린 예시 */
function sampleHtml(t, o, withParen) {
  const text = withParen ? SAMPLE.paren : SAMPLE.text;
  const m = { text, html: textToHtml(text), origHtml: textToHtml(text) };
  const c = { display: SAMPLE.name, color: '#555555', img: '', placeholder: true };
  const block = renderBlock({ t, c, lines: [m] }, { ...o, divider: false, dice: false, nameColor: 'text' });
  return `<div style="background:${o.bg};font-family:${fontStack(o)};word-break:keep-all;overflow-wrap:anywhere;">${block}</div>`;
}

function renderTypeCards() {
  const wrap = $('#typeCards');
  wrap.innerHTML = '';
  // 카드 속 예시는 작게
  const mini = { ...state.opts, font: 9, avatar: 30 };
  for (const t of state.types) {
    const card = document.createElement('div');
    card.className = 'type-card';
    card.classList.toggle('active', state.editingType === t.id);
    card.dataset.id = t.id;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="tc-head">
        <span class="tc-title"></span>
        <span class="tc-links"><button class="link tc-edit">수정</button><span class="bar">|</span><button class="link tc-del">삭제</button></span>
      </div>
      <div class="tc-preview"></div>
      <div class="tc-count"></div>`;
    card.querySelector('.tc-title').textContent = t.label || '(이름 없는 분류)';
    card.querySelector('.tc-preview').innerHTML = sampleHtml(t, mini, false);
    card.querySelector('.tc-count').textContent = state.names.length ? `화자 ${usersOf(t.id)}명` : '';
    const open = () => { state.editingType = state.editingType === t.id ? null : t.id; renderTypeCards(); renderTypePanel(); };
    card.addEventListener('click', (e) => { if (!e.target.closest('.tc-del')) open(); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === card) open(); });
    card.querySelector('.tc-del').addEventListener('click', () => deleteType(t));
    wrap.append(card);
  }
  const add = document.createElement('button');
  add.className = 'type-card add';
  add.textContent = '+새 분류';
  add.addEventListener('click', addType);
  wrap.append(add);
}

function addType() {
  const t = { ...BASE_TYPE, id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  t.label = `새 분류 ${state.types.length + 1}`;
  state.types.push(t);
  state.editingType = t.id;
  saveTypes();
  renderStep2();
  const input = $('#typePanel .t-label');
  if (input) { input.focus(); input.select(); }
}

function deleteType(t) {
  if (state.types.length <= 1) { toast('분류는 하나 이상 있어야 합니다'); return; }
  const users = usersOf(t.id);
  const rest = state.types.filter((x) => x !== t);
  const fallback = (rest.find((x) => x.id === 'thin') || rest.find((x) => x.kind === t.kind) || rest[0]);
  const msg = users
    ? `'${t.label}' 분류를 지우면 이 분류를 쓰던 화자 ${users}명이 '${fallback.label}'(으)로 바뀝니다. 지우시겠습니까?`
    : `'${t.label}' 분류를 지우시겠습니까?`;
  if (!confirm(msg)) return;
  state.types = rest;
  for (const c of Object.values(state.chars)) if (c.type === t.id) c.type = fallback.id;
  // 다른 로그에서 저장해 둔 화자 설정도 함께 정리
  const saved = loadJSON(STORE_KEY) || {};
  for (const c of Object.values(saved)) if (c.type === t.id) c.type = fallback.id;
  saveJSON(STORE_KEY, saved);
  if (state.editingType === t.id) state.editingType = null;
  saveTypes();
  saveChars();
  renderStep2();
}

/* ---------- 분류 설정 창 ---------- */
function renderTypePanel() {
  const panel = $('#typePanel');
  const t = typeById(state.editingType);
  panel.hidden = !t;
  panel.innerHTML = '';
  if (!t) return;

  panel.innerHTML = `
    <div class="tp-grid">
      <div class="tp-form">
        <div class="tp-row">
          <span class="tp-label">분류 이름</span>
          <input type="text" class="t-label" maxlength="30" placeholder="분류 이름" />
        </div>
        <div class="tp-row">
          <span class="tp-label">모양</span>
          <div class="seg">
            <button data-kind="char">인물형 (얼굴 · 이름 · 대사)</button>
            <button data-kind="narr">지문형 (대사만)</button>
          </div>
        </div>
        <div class="tp-row">
          <span class="tp-label">글자 모양</span>
          <div class="rt-toolbar">
            <button class="rt-btn" data-k="bold" title="굵게"><b>B</b></button>
            <button class="rt-btn" data-k="italic" title="기울임"><i>I</i></button>
            <button class="rt-btn" data-k="underline" title="밑줄"><u>U</u></button>
            <button class="rt-btn" data-k="strike" title="취소선"><s>S</s></button>
            <span class="rt-sep"></span>
            <button class="rt-btn" data-align="left">왼쪽</button>
            <button class="rt-btn" data-align="center">가운데</button>
            <button class="rt-btn" data-align="right">오른쪽</button>
          </div>
        </div>
        <div class="tp-row">
          <span class="tp-label">글자 크기</span>
          <span class="rt-field"><input type="number" class="t-size" min="50" max="300" step="5" /> % <span class="t-px"></span></span>
        </div>
        <div class="tp-row">
          <span class="tp-label">글자색</span>
          <span class="rt-field"><input type="color" class="t-color" /><button class="rt-btn t-color-reset" title="3단계의 테마 색을 따릅니다">기본색</button></span>
        </div>
        <div class="tp-row">
          <span class="tp-label">괄호</span>
          <span class="rt-field">
            <label class="chk"><input type="checkbox" class="t-dim" /> (괄호) 속 글 색 바꾸기</label>
            <input type="color" class="t-paren" />
            <button class="rt-btn t-paren-reset" title="3단계의 괄호 색을 따릅니다">기본색</button>
          </span>
        </div>
      </div>
      <div class="tp-side">
        <span class="tp-label">미리보기</span>
        <div class="tp-preview"></div>
      </div>
    </div>
    <div class="actions">
      <button class="ghost tp-del">이 분류 삭제</button>
      <button class="primary tp-close">완료</button>
    </div>`;

  const o = state.opts;
  const q = (s) => panel.querySelector(s);
  q('.t-label').value = t.label;
  q('.t-size').value = t.size;

  const sync = () => {
    panel.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', t.kind === b.dataset.kind));
    panel.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', !!t[b.dataset.k]));
    const align = t.align || (t.kind === 'char' ? 'left' : 'center');
    panel.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', align === b.dataset.align));
    q('.t-px').textContent = `(지금 약 ${Math.round(o.font * t.size / 10) / 10}px)`;
    q('.t-color').value = t.color || (t.kind === 'char' ? o.text : o.narr);
    q('.t-color-reset').classList.toggle('on', !t.color);
    q('.t-dim').checked = t.dimParen;
    q('.t-paren').value = t.parenColor || o.dim;
    q('.t-paren').disabled = !t.dimParen;
    q('.t-paren-reset').disabled = !t.dimParen;
    q('.t-paren-reset').classList.toggle('on', !t.parenColor);
    q('.tp-preview').innerHTML = sampleHtml(t, { ...o, font: Math.max(o.font, 13) }, true);
  };
  // 설정을 바꾸면 카드 예시, 화자 드롭다운까지 함께 고친다
  const changed = () => {
    saveTypes();
    sync();
    const card = $(`#typeCards .type-card[data-id="${t.id}"]`);
    if (card) {
      card.querySelector('.tc-title').textContent = t.label || '(이름 없는 분류)';
      card.querySelector('.tc-preview').innerHTML = sampleHtml(t, { ...o, font: 9, avatar: 30 }, false);
    }
    refreshCharTypes();
  };

  q('.t-label').addEventListener('input', (e) => { t.label = e.target.value; changed(); });
  panel.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    if (t.kind === b.dataset.kind) return;
    t.kind = b.dataset.kind;
    // 모양을 바꾸면 기본 정렬이 달라지므로 정렬을 기본값으로 둔다
    t.align = '';
    changed();
    renderCharList(); // 인물형이면 얼굴·이름 칸이 필요하다
  }));
  panel.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { t[b.dataset.k] = !t[b.dataset.k]; changed(); }));
  panel.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => { t.align = b.dataset.align; changed(); }));
  q('.t-size').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 50 && v <= 300) { t.size = v; changed(); }
  });
  q('.t-size').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) t.size = Math.min(300, Math.max(50, v));
    e.target.value = t.size;
    changed();
  });
  q('.t-color').addEventListener('input', (e) => { t.color = e.target.value; changed(); });
  q('.t-color-reset').addEventListener('click', () => { t.color = ''; changed(); });
  q('.t-dim').addEventListener('change', (e) => { t.dimParen = e.target.checked; changed(); });
  q('.t-paren').addEventListener('input', (e) => { t.parenColor = e.target.value; changed(); });
  q('.t-paren-reset').addEventListener('click', () => { t.parenColor = ''; changed(); });
  q('.tp-del').addEventListener('click', () => deleteType(t));
  q('.tp-close').addEventListener('click', () => { state.editingType = null; renderTypeCards(); renderTypePanel(); });
  sync();
}

/** 분류 이름·모양이 바뀌면 화자 목록의 드롭다운과 예시만 새로 고친다 (입력 중인 칸의 포커스를 지키기 위해) */
function refreshCharTypes() {
  document.querySelectorAll('#charList .char-row').forEach((row) => row.refreshType && row.refreshType());
}

function refreshTypeCounts() {
  document.querySelectorAll('#typeCards .type-card[data-id]').forEach((card) => {
    card.querySelector('.tc-count').textContent = `화자 ${usersOf(card.dataset.id)}명`;
  });
}

/* ---------- 화자 목록 ---------- */
function buildCharRow(name) {
  const c = state.chars[name];
  const msgs = state.messages.filter((m) => m.name === name);
  const row = document.createElement('div');
  row.className = 'char-row';
  row.dataset.name = name;

  row.innerHTML = `
    <div class="avatar"></div>
    <div>
      <div class="char-head">
        <span class="swatch"></span>
        <span class="char-name"></span>
        <span class="count"></span>
        <select class="type"></select>
      </div>
      <div class="sample"></div>
      <div class="char-fields">
        <input type="text" class="display" placeholder="표시 이름" />
        <span></span>
        <label class="field-color">이름 색 <input type="color" class="color" /></label>
        <div class="img-actions">
          <button class="small pick">이미지 파일</button>
          <input type="file" accept="image/*" class="file" hidden />
          <input type="url" class="url" placeholder="또는 이미지 주소(https://…)" />
          <button class="small ghost clear">지우기</button>
        </div>
      </div>
    </div>`;

  row.querySelector('.swatch').style.background = msgs[0].color || '#888';
  row.querySelector('.char-name').textContent = displayLabel(name);
  row.querySelector('.count').textContent = `${msgs.length}개`;
  const sample = row.querySelector('.sample');
  sample.textContent = msgs.slice(0, 2).map((m) => m.text.replace(/\n/g, ' ')).join('  /  ');

  const sel = row.querySelector('.type');
  const fillTypes = () => {
    sel.innerHTML = '';
    for (const [v, label] of typeOptions()) sel.add(new Option(label, v, false, v === c.type));
  };

  const display = row.querySelector('.display');
  const color = row.querySelector('.color');
  const url = row.querySelector('.url');
  const file = row.querySelector('.file');
  display.value = c.display;
  color.value = c.color || '#333333';
  url.value = c.img.startsWith('data:') ? '' : c.img;

  // 예시 대사에 분류의 굵기·기울임 등을 입혀서 보여준다 (색과 크기는 목록이 읽기 좋게 그대로)
  const styleSample = () => {
    const t = typeById(c.type);
    const deco = t ? [t.underline && 'underline', t.strike && 'line-through'].filter(Boolean).join(' ') : '';
    sample.style.fontWeight = t && t.bold ? '700' : '';
    sample.style.fontStyle = t && t.italic ? 'italic' : '';
    sample.style.textDecoration = deco;
  };

  const refresh = () => {
    const isChar = isCharType(c.type);
    row.classList.toggle('is-char', isChar);
    row.classList.toggle('skip', c.type === SKIP);
    const av = row.querySelector('.avatar');
    av.style.backgroundImage = isChar && c.img ? `url("${c.img.replace(/"/g, '%22')}")` : '';
    styleSample();
    saveChars();
  };
  row.refreshType = () => { fillTypes(); refresh(); };

  sel.addEventListener('change', () => { c.type = sel.value; refresh(); refreshTypeCounts(); updateCharFilterCounts(); });
  display.addEventListener('input', () => { c.display = display.value; refresh(); });
  color.addEventListener('input', () => { c.color = color.value; saveChars(); });
  url.addEventListener('change', () => { c.img = url.value.trim(); refresh(); });
  row.querySelector('.pick').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      c.img = await resizeImage(file.files[0], 200);
      url.value = '';
      refresh();
    } catch { toast('이미지를 읽지 못했습니다'); }
    file.value = '';
  });
  row.querySelector('.clear').addEventListener('click', () => { c.img = ''; url.value = ''; refresh(); });

  fillTypes();
  refresh();
  return row;
}

/** 가운데를 정사각형으로 잘라 작게 줄인 data URI를 만든다 (출력 용량 절약) */
function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        const out = Math.min(size, s);
        canvas.width = canvas.height = out;
        canvas.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
        let data = canvas.toDataURL('image/webp', 0.9);
        if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/png');
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* =========================================================
 * 서식 있는 대사 (3단계 대사 수정)
 *  - 메시지마다 text(검색·판정용 순수 글자)와 html(서식)을 함께 들고 있다
 *  - html은 <b> <i> <u> <s> <span style="color"> <br> 만 쓰는 정리된 형태
 * ========================================================= */
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const textToHtml = (text) => esc(text).replace(/\n/g, '<br>');

function cssColorToHex(c) {
  if (!c) return '';
  c = String(c).trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(c)) return normalizeHex(c);
  const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, '0')).join('');
  return '';
}

/** 편집칸의 DOM을 허용된 서식만 남긴 html과 순수 글자로 정리 */
function sanitizeRich(root) {
  let html = '';
  let text = '';
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) { html += textToHtml(n.nodeValue); text += n.nodeValue; continue; }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = n.tagName;
      if (tag === 'BR') { html += '<br>'; text += '\n'; continue; }
      if (/^(DIV|P)$/.test(tag) && text && !text.endsWith('\n')) { html += '<br>'; text += '\n'; }
      const st = n.style || {};
      const deco = `${st.textDecorationLine || ''} ${st.textDecoration || ''}`;
      const tags = [];
      if (/^(B|STRONG)$/.test(tag) || st.fontWeight === 'bold' || +st.fontWeight >= 600) tags.push('b');
      if (/^(I|EM)$/.test(tag) || st.fontStyle === 'italic') tags.push('i');
      if (tag === 'U' || deco.includes('underline')) tags.push('u');
      if (/^(S|STRIKE|DEL)$/.test(tag) || deco.includes('line-through')) tags.push('s');
      const color = cssColorToHex(tag === 'FONT' ? n.getAttribute('color') : st.color);
      html += tags.map((t) => `<${t}>`).join('') + (color ? `<span style="color:${color}">` : '');
      walk(n);
      html += (color ? '</span>' : '') + tags.reverse().map((t) => `</${t}>`).join('');
    }
  };
  walk(root);
  // 빈 태그와 끝의 빈 줄 정리
  let prev;
  do {
    prev = html;
    html = html.replace(/<(b|i|u|s)><\/\1>/g, '').replace(/<span style="color:#[0-9a-f]{6}"><\/span>/g, '');
  } while (html !== prev);
  html = html.replace(/(<br>)+$/, '');
  return { html, text: text.replace(/\n+$/, '') };
}

const RICH_STYLE = { B: 'font-weight:700;', I: 'font-style:italic;', U: 'text-decoration:underline;', S: 'text-decoration:line-through;' };
const richTpl = document.createElement('template');

/** 정리된 html을 에디터에서도 깨지지 않는 인라인 스타일로 바꾼다. 괄호 흐리게도 여기서 처리 */
function richToOutput(html, dimColor) {
  richTpl.innerHTML = html;
  let depth = 0;
  const text = (str) => {
    let out = dimColor && depth > 0 ? `<span style="color:${dimColor}">` : '';
    for (const ch of str) {
      if (dimColor && (ch === '(' || ch === '（')) {
        if (depth === 0) out += `<span style="color:${dimColor}">`;
        depth++;
        out += esc(ch);
      } else if (dimColor && (ch === ')' || ch === '）') && depth > 0) {
        out += esc(ch);
        depth--;
        if (depth === 0) out += '</span>';
      } else {
        out += ch === '\n' ? '<br>' : esc(ch);
      }
    }
    if (dimColor && depth > 0) out += '</span>';
    return out;
  };
  const walk = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += text(n.nodeValue);
      else if (n.tagName === 'BR') out += '<br>';
      else if (RICH_STYLE[n.tagName]) out += `<span style="${RICH_STYLE[n.tagName]}">${walk(n)}</span>`;
      else if (n.tagName === 'SPAN' && cssColorToHex(n.style.color)) out += `<span style="color:${cssColorToHex(n.style.color)};">${walk(n)}</span>`;
      else if (n.nodeType === Node.ELEMENT_NODE) out += walk(n);
    }
    return out;
  };
  return walk(richTpl.content);
}

/* =========================================================
 * 출력 HTML 생성 (에디터 호환을 위해 인라인 스타일 + table)
 * ========================================================= */
const FONT_FAMILY = FONT_GROUPS.gothic.stack;

/** 스타일 속성을 깨뜨리는 글자는 뺀다 */
const cleanFontName = (name) => String(name || '').replace(/["'<>;{}\\]/g, '').trim();
const allFonts = () => [...FONTS, ...state.userFonts];
const fontById = (id) => allFonts().find((f) => f.id === id) || FONTS[0];

function fontStack(o) {
  const f = fontById(o.fontFamily);
  const stack = (FONT_GROUPS[f.group] || FONT_GROUPS.gothic).stack;
  const name = cleanFontName(f.name);
  return name ? `'${name}',${stack}` : stack;
}
/** 구글 폰트에서 받을 수 있는 글꼴이면 불러올 주소 */
function webFontUrl(o) {
  const f = fontById(o.fontFamily);
  const suffix = f.google ? '' : f.web;
  if (suffix === undefined || !cleanFontName(f.name)) return '';
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanFontName(f.name)).replace(/%20/g, '+')}${suffix}&display=swap`;
}
/** 미리보기에서도 보이도록 변환기 화면에 웹 글꼴을 불러온다 */
function ensureWebFont(o) {
  const href = webFontUrl(o);
  if (!href || document.querySelector(`link[data-webfont="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.webfont = href;
  document.head.append(link);
}

function formatText(text, dimColor) {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (dimColor && (ch === '(' || ch === '（')) {
      if (depth === 0) out += `<span style="color:${dimColor}">`;
      depth++;
      out += esc(ch);
    } else if (dimColor && (ch === ')' || ch === '）') && depth > 0) {
      out += esc(ch);
      depth--;
      if (depth === 0) out += '</span>';
    } else {
      out += ch === '\n' ? '<br>' : esc(ch);
    }
  }
  if (depth > 0) out += '</span>';
  return out;
}

/** 판정 결과를 해석. 해석할 수 없으면 null */
function parseDice(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const sep = /\s*(?:＞|→)\s*/;

  // CoC: CC<=60 이성 (1D100<=60) 보너스, 페널티 주사위[0] ＞ 96 ＞ 96 ＞ 실패
  let m = t.match(/^CC(?:\(-?\d+\))?<=(\d+)\s*(.*?)\s*\(1D100<=\d+\)(.*)$/i);
  if (m) {
    const parts = m[3].split(sep).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const n = +m[1];
      const roll = parts[parts.length - 2];
      const raw = parts.length >= 4 ? parts[1] : roll;
      return {
        title: `${m[2] || '판정'} Roll`,
        rows: [
          ['기준치', `${n}/${Math.floor(n / 2)}/${Math.floor(n / 5)}`],
          ['굴림', raw !== roll ? `${raw} → ${roll}` : roll],
        ],
        result: parts[parts.length - 1],
      };
    }
  }

  // 일반 주사위: 4D6 대 크리쳐 살상탄 (4D6) ＞ 13[6,1,1,5] ＞ 13
  m = t.match(/^(\d*[dD]\d+\S*)\s*(.*?)\s*\(([^()]*[dD][^()]*)\)\s*(?:＞|→)\s*(.+)$/);
  if (m) {
    const parts = m[4].split(sep).map((s) => s.trim()).filter(Boolean);
    const final = parts[parts.length - 1];
    const rows = [['주사위', m[3]]];
    if (parts.length > 1) rows.push(['굴림', parts.slice(0, -1).join(' → ')]);
    return { title: m[2] || m[3], rows, total: final };
  }
  return null;
}

function resultColor(r) {
  if (/대성공|결정적|크리티컬/.test(r)) return '#8fe0a6';
  if (/극단적/.test(r)) return '#a4eb9c';
  if (/어려운/.test(r)) return '#c6f0bd';
  if (/대실패|펌블/.test(r)) return '#ff9d9d';
  if (/실패/.test(r)) return '#ffd2d2';
  if (/성공/.test(r)) return '#dcf5d4';
  return '#ffffff';
}

function diceCard(d, o) {
  const size = `font-size:${Math.round(o.font * 0.95 * 10) / 10}px;font-family:${fontStack(o)};`;
  const cell = `${size}padding:0.5em 1.1em;border:0;border-top:1px solid #dcdce0;text-align:left;vertical-align:middle;`;
  const label = `${cell}background:#ececef;color:#2b2b2e;font-weight:700;white-space:nowrap;border-right:1px solid #dcdce0;width:auto;`;
  const value = `${cell}background:#ffffff;color:#1d1d1f;min-width:8em;`;
  let rows = d.rows.map(([k, v]) => `<tr><td style="${label}">${esc(k)}:</td><td style="${value}">${esc(v)}</td></tr>`).join('');
  if (d.result) {
    rows += `<tr><td style="${label}">판정결과:</td><td style="${value}background:${resultColor(d.result)};font-weight:700;">${esc(d.result)}</td></tr>`;
  } else {
    rows += `<tr><td style="${label}">결과:</td><td style="${value}font-weight:700;">${esc(d.total)}</td></tr>`;
  }
  return `<table border="0" cellpadding="0" cellspacing="0" style="width:auto;border-collapse:separate;border-spacing:0;border:1px solid #dcdce0;border-radius:0.8em;overflow:hidden;margin:0.3em 0;${size}line-height:1.4;">`
    + `<tr><th colspan="2" style="${size}padding:0.6em 1.1em;border:0;background:#1c1c1e;color:#ffffff;text-align:left;font-weight:700;">${esc(d.title)}</th></tr>`
    + rows + '</table>';
}

/** 대사 한 줄의 글자 (괄호 색 포함). 서식을 건드리지 않은 대사는 빠른 길로 */
function lineHtml(m, t, o) {
  const dim = t.dimParen ? (t.parenColor || o.dim) : '';
  return m.html === m.origHtml ? formatText(m.text, dim) : richToOutput(m.html, dim);
}

function buildBlocks() {
  const o = state.opts;
  const blocks = [];
  let cur = null;
  for (const m of state.messages) {
    const c = state.chars[m.name];
    const t = c && typeById(c.type);
    if (m.deleted || !t) continue; // 지우거나 제외한 대사는 앞뒤 대사 합치기를 끊지 않는다
    if (t.kind === 'char') {
      if (o.merge && cur && cur.key === m.name) {
        cur.lines.push(m);
      } else {
        cur = { t, key: m.name, c, lines: [m] };
        blocks.push(cur);
      }
    } else {
      cur = null;
      blocks.push({ t, lines: [m] });
    }
  }
  return blocks;
}

/** 블록 하나를 그린다. 2단계 분류 예시도 이 함수를 써서 실제 출력과 똑같이 보인다 */
function renderBlock(b, o) {
  // 에디터(특히 quirks 모드)에서는 표 안 글자가 바깥 글자 크기를 물려받지 않으므로 칸마다 직접 지정
  const font = `font-size:${o.font}px;font-family:${fontStack(o)};`;
  const border = o.divider ? `border-bottom:1px solid ${o.line};` : '';
  const t = b.t;

  if (t.kind === 'char') {
    const c = b.c;
    const S = +o.avatar;
    const radius = o.radius.endsWith('%') ? o.radius : `${o.radius}px`;
    const nameColor = o.nameColor === 'char' ? c.color : o.text;
    let face = `<div style="width:${S}px;height:${S}px;"></div>`;
    if (c.img) {
      face = `<img src="${esc(c.img)}" alt="${esc(c.display)}" width="${S}" height="${S}" style="width:${S}px;height:${S}px;border-radius:${radius};object-fit:cover;display:block;">`;
    } else if (c.placeholder) {
      face = `<div style="width:${S}px;height:${S}px;border-radius:${radius};background:#d9d9dc;color:#6e6e73;font-size:${Math.max(7, Math.round(S / 5))}px;display:flex;align-items:center;justify-content:center;">이미지</div>`;
    }
    const lines = b.lines.map((m, i) => {
      // 판정 표는 인물형 분류에만 쓰고, 표에는 글자 모양을 입히지 않는다
      const d = o.dice ? parseDice(m.text) : null;
      const gap = `margin:${i ? '0.25em' : '0'} 0 0;padding:0;line-height:1.6;`;
      return d
        ? `<div style="${gap}text-align:left;">${diceCard(d, o)}</div>`
        : `<div style="${gap}${textCss(t, o)}">${lineHtml(m, t, o)}</div>`;
    }).join('');
    const td = `border:0;vertical-align:top;text-align:left;background:transparent;color:${o.text};${font}`;
    return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin:0;border:0;border-collapse:collapse;background:transparent;${border}"><tr>`
      + `<td style="${td}width:${S}px;padding:0.8em 0 0.8em 1.4em;">${face}</td>`
      + `<td style="${td}padding:0.8em 1.4em 0.8em 1em;">`
      + `<div style="font-weight:700;font-size:1.05em;color:${nameColor};margin:0 0 0.15em;text-align:left;">${esc(c.display)}</div>`
      + lines + '</td></tr></table>';
  }
  return `<div style="margin:0;padding:0.7em 1.4em;line-height:1.6;${font}${border}${textCss(t, o)}">${lineHtml(b.lines[0], t, o)}</div>`;
}

function renderOutput() {
  const o = state.opts;
  const blocks = buildBlocks();
  const html = blocks.map((b) => renderBlock(b, o)).join('\n');
  const body = `<div style="background:${o.bg};color:${o.text};font-size:${o.font}px;font-family:${fontStack(o)};word-break:keep-all;overflow-wrap:anywhere;">\n${html}\n</div>`;
  return { body, count: blocks.length };
}

/* =========================================================
 * 3단계
 * ========================================================= */
/** 슬라이더와 숫자 칸을 함께 쓰는 값. 숫자 칸은 슬라이더 범위를 넘는 값도 받는다 */
const NUM_OPTS = {
  avatar: { min: 10, max: 300 },
  font: { min: 4, max: 60 },
};
const CHECK_OPTS = ['merge', 'dice', 'divider'];

function bindOptions() {
  const o = state.opts;
  const colorIds = ['bg', 'text', 'narr', 'dim', 'line'];
  const fontSel = $('#o-fontFamily');

  const sync = () => {
    for (const k of colorIds) $(`#o-${k}`).value = o[k];
    $('#o-nameColor').value = o.nameColor;
    $('#o-radius').value = o.radius;
    for (const k of Object.keys(NUM_OPTS)) {
      $(`#o-${k}`).value = o[k];
      if (document.activeElement !== $(`#o-${k}Num`)) $(`#o-${k}Num`).value = o[k];
    }
    fillFontSelect();
    $('#fontSample').style.fontFamily = fontStack(o);
    $('#o-fontNote').hidden = !webFontUrl(o);
    for (const k of CHECK_OPTS) $(`#o-${k}`).checked = o[k];
  };
  const update = () => { saveJSON(OPT_KEY, o); sync(); ensureWebFont(o); refreshStep3(); };

  for (const k of colorIds) $(`#o-${k}`).addEventListener('input', (e) => { o[k] = e.target.value; update(); });
  for (const k of ['nameColor', 'radius']) $(`#o-${k}`).addEventListener('change', (e) => { o[k] = e.target.value; update(); });
  for (const [k, { min, max }] of Object.entries(NUM_OPTS)) {
    $(`#o-${k}`).addEventListener('input', (e) => { o[k] = +e.target.value; update(); });
    const num = $(`#o-${k}Num`);
    num.min = min;
    num.max = max;
    // 입력하는 도중에는 범위 안의 값만 반영하고, 칸을 벗어나면 범위에 맞춰 정리한다
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v) && v >= min && v <= max) { o[k] = v; update(); }
    });
    num.addEventListener('change', () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v)) o[k] = Math.min(max, Math.max(min, v));
      num.value = o[k];
      update();
    });
  }
  fontSel.addEventListener('change', () => { o.fontFamily = fontSel.value; update(); });
  bindFontAdd(update);
  for (const k of CHECK_OPTS) $(`#o-${k}`).addEventListener('change', (e) => { o[k] = e.target.checked; update(); });
  document.querySelectorAll('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
    Object.assign(o, PRESETS[btn.dataset.preset]);
    update();
  }));
  sync();
  ensureWebFont(o);
}

/** 글꼴 드롭다운을 종류별 묶음으로 채운다. 내가 추가한 글꼴은 맨 위 묶음 */
function fillFontSelect() {
  const sel = $('#o-fontFamily');
  sel.innerHTML = '';
  const addGroup = (label, fonts) => {
    if (!fonts.length) return;
    const g = document.createElement('optgroup');
    g.label = label;
    for (const f of fonts) g.append(new Option(f.label, f.id));
    sel.append(g);
  };
  addGroup('내 글꼴', state.userFonts);
  for (const [key, g] of Object.entries(FONT_GROUPS)) addGroup(g.label, FONTS.filter((f) => f.group === key));
  sel.value = fontById(state.opts.fontFamily).id;

  const chips = $('#userFonts');
  chips.innerHTML = '';
  for (const f of state.userFonts) {
    const chip = document.createElement('span');
    chip.className = 'font-chip';
    chip.innerHTML = '<span class="nm"></span><span class="gp"></span><button class="link x" title="이 글꼴 지우기">×</button>';
    chip.querySelector('.nm').textContent = f.label;
    chip.querySelector('.nm').style.fontFamily = `'${cleanFontName(f.name)}',${FONT_GROUPS[f.group].stack}`;
    chip.querySelector('.gp').textContent = FONT_GROUPS[f.group].label + (f.google ? ' · 구글' : '');
    chip.querySelector('.x').addEventListener('click', () => removeUserFont(f));
    chips.append(chip);
  }
}

function saveUserFonts() { saveJSON(FONT_KEY, state.userFonts); }

function addUserFont(name, group, google) {
  name = cleanFontName(name);
  if (!name) return null;
  const id = `user:${name}`;
  let f = state.userFonts.find((x) => x.id === id);
  if (f) Object.assign(f, { group, google });
  else {
    f = { id, name, label: name, group, google };
    state.userFonts.push(f);
  }
  saveUserFonts();
  return f;
}

function removeUserFont(f) {
  if (!confirm(`'${f.label}' 글꼴을 목록에서 지우시겠습니까?`)) return;
  state.userFonts = state.userFonts.filter((x) => x !== f);
  saveUserFonts();
  if (state.opts.fontFamily === f.id) state.opts.fontFamily = '';
  saveJSON(OPT_KEY, state.opts);
  fillFontSelect();
  $('#fontSample').style.fontFamily = fontStack(state.opts);
  $('#o-fontNote').hidden = !webFontUrl(state.opts);
  refreshStep3();
}

function bindFontAdd(update) {
  const box = $('#fontAdd');
  const groupSel = $('#fontAddGroup');
  for (const [key, g] of Object.entries(FONT_GROUPS)) groupSel.add(new Option(g.label, key));
  const close = () => { box.hidden = true; $('#fontAddBtn').hidden = false; };
  $('#fontAddBtn').addEventListener('click', () => {
    box.hidden = false;
    $('#fontAddBtn').hidden = true;
    $('#fontAddName').value = '';
    $('#fontAddWeb').checked = false;
    $('#fontAddName').focus();
  });
  $('#fontAddCancel').addEventListener('click', close);
  const ok = () => {
    const f = addUserFont($('#fontAddName').value, groupSel.value, $('#fontAddWeb').checked);
    if (!f) { toast('글꼴 이름을 적어 주십시오'); $('#fontAddName').focus(); return; }
    state.opts.fontFamily = f.id;
    close();
    update();
    toast(`'${f.label}' 글꼴을 추가했습니다`);
  };
  $('#fontAddOk').addEventListener('click', ok);
  $('#fontAddName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) ok(); });
}

function renderPreview() {
  const { body, count } = renderOutput();
  $('#preview').innerHTML = body;
  $('#stats').textContent = `블록 ${count}개 · ${(new Blob([body]).size / 1024).toFixed(0)}KB`;
}

/* ---------- 대사 수정 ---------- */
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#preview').hidden = tab !== 'preview';
  $('#editor').hidden = tab !== 'edit';
  refreshStep3();
}

function refreshStep3() {
  if ($('#step3').hidden) return;
  if (state.tab === 'edit') renderEditor();
  else renderPreview();
}

const isEdited = (m) => m.html !== m.origHtml;

function renderEditor() {
  const list = $('#editList');
  const scroll = list.scrollTop;
  list.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.messages.forEach((m, i) => {
    const c = state.chars[m.name];
    if (!c || !typeById(c.type)) return;
    const isChar = isCharType(c.type);
    const row = document.createElement('div');
    row.className = 'edit-row';
    row.dataset.i = i;
    row.innerHTML = `
      <div class="edit-meta">
        <span class="edit-name"><span class="swatch"></span><span class="n"></span></span>
        <span class="edit-no"></span>
      </div>
      <div class="edit-text" spellcheck="false"></div>
      <div class="edit-actions">
        <button class="small del"></button>
        <button class="small ghost revert" title="처음 불러온 내용으로">원래대로</button>
      </div>`;
    row.querySelector('.swatch').style.background = (isChar ? c.color : '') || m.color || '#888';
    row.querySelector('.n').textContent = isChar ? (c.display || displayLabel(m.name)) : `${typeLabel(c.type)} · ${displayLabel(m.name)}`;
    row.querySelector('.edit-no').textContent = `#${i + 1}`;
    row.querySelector('.edit-text').innerHTML = m.html;
    syncEditRow(row, m);
    frag.append(row);
  });
  list.append(frag);
  applyEditFilter();
  list.scrollTop = scroll;
}

function syncEditRow(row, m) {
  row.classList.toggle('edited', isEdited(m));
  row.classList.toggle('deleted', m.deleted);
  const box = row.querySelector('.edit-text');
  const editable = m.deleted ? 'false' : 'true';
  if (box.contentEditable !== editable) box.contentEditable = editable;
  row.querySelector('.del').textContent = m.deleted ? '되살리기' : '삭제';
}

function applyEditFilter() {
  const q = $('#editSearch').value.trim().toLowerCase();
  const f = $('#editFilter').value;
  let shown = 0;
  $('#editList').querySelectorAll('.edit-row').forEach((row) => {
    const m = state.messages[+row.dataset.i];
    const c = state.chars[m.name];
    let ok = f === 'all' || (f === 'edited' && isEdited(m)) || (f === 'deleted' && m.deleted);
    if (ok && q) ok = `${m.text}\n${m.name}\n${c.display || ''}`.toLowerCase().includes(q);
    row.hidden = !ok;
    if (ok) shown++;
  });
  let empty = $('#editList .edit-empty');
  if (!shown) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'edit-empty';
      $('#editList').append(empty);
    }
    empty.textContent = q || f !== 'all' ? '조건에 맞는 대사가 없습니다' : '표시할 대사가 없습니다';
  } else if (empty) empty.remove();
  updateEditStats();
}

function updateEditStats() {
  const edited = state.messages.filter((m) => !m.deleted && isEdited(m)).length;
  const deleted = state.messages.filter((m) => m.deleted).length;
  $('#stats').textContent = `고침 ${edited}개 · 삭제 ${deleted}개`;
}

function revertMessage(m) {
  m.html = m.origHtml;
  m.text = sanitizeRich(Object.assign(document.createElement('div'), { innerHTML: m.origHtml })).text;
}

/* ---------- 서식 도구 ---------- */
let rtRange = null; // 마지막으로 편집칸 안에서 고른 범위 (색 고르기 창을 열면 선택이 풀리므로 기억해 둔다)

const editBoxOf = (node) => {
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  return el && el.closest('#editList .edit-text');
};

function updateRtState() {
  document.querySelectorAll('#rtBar [data-cmd]').forEach((b) => {
    if (!/^(bold|italic|underline|strikeThrough)$/.test(b.dataset.cmd)) return;
    let on = false;
    try { on = document.queryCommandState(b.dataset.cmd); } catch { /* 지원하지 않는 브라우저 */ }
    b.classList.toggle('on', on);
  });
}

function applyRt(cmd) {
  const box = rtRange && editBoxOf(rtRange.commonAncestorContainer);
  if (!box || !box.isConnected || !box.isContentEditable) { toast('서식을 줄 글자를 먼저 드래그해서 고르십시오'); return; }
  box.focus();
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(rtRange);
  if (sel.isCollapsed && cmd !== 'removeFormat') { toast('서식을 줄 글자를 먼저 드래그해서 고르십시오'); return; }
  document.execCommand('styleWithCSS', false, false);
  document.execCommand(cmd, false, cmd === 'foreColor' ? $('#rtColor').value : null);
  updateRtState();
}

function insertPlain(text) {
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    if (i) insertBreak();
    if (line) document.execCommand('insertText', false, line);
  });
}
function insertBreak() {
  if (!document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
}

function bindEditor() {
  document.querySelectorAll('.tabs .tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  const list = $('#editList');
  list.addEventListener('input', (e) => {
    const box = editBoxOf(e.target);
    if (!box) return;
    const row = box.closest('.edit-row');
    const m = state.messages[+row.dataset.i];
    Object.assign(m, sanitizeRich(box));
    syncEditRow(row, m);
    updateEditStats();
  });
  // 엔터는 줄바꿈(<br>)으로, 붙여넣기는 서식 없이
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !editBoxOf(e.target)) return;
    e.preventDefault();
    insertBreak();
  });
  list.addEventListener('paste', (e) => {
    if (!editBoxOf(e.target)) return;
    e.preventDefault();
    insertPlain(e.clipboardData.getData('text/plain'));
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = btn.closest('.edit-row');
    const m = state.messages[+row.dataset.i];
    if (btn.classList.contains('del')) m.deleted = !m.deleted;
    if (btn.classList.contains('revert')) {
      revertMessage(m);
      row.querySelector('.edit-text').innerHTML = m.html;
    }
    syncEditRow(row, m);
    updateEditStats();
  });

  document.addEventListener('selectionchange', () => {
    const sel = getSelection();
    if (!sel.rangeCount || !editBoxOf(sel.anchorNode)) return;
    rtRange = sel.getRangeAt(0).cloneRange();
    updateRtState();
  });
  document.querySelectorAll('#rtBar [data-cmd]').forEach((b) => {
    // 버튼을 눌러도 편집칸의 선택이 풀리지 않게
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => applyRt(b.dataset.cmd));
  });
  $('#rtColor').addEventListener('change', () => applyRt('foreColor'));

  $('#editSearch').addEventListener('input', applyEditFilter);
  $('#editFilter').addEventListener('change', applyEditFilter);
  $('#editReset').addEventListener('click', () => {
    const changed = state.messages.filter((m) => m.deleted || isEdited(m)).length;
    if (!changed) { toast('되돌릴 내용이 없습니다'); return; }
    if (!confirm(`고치거나 삭제한 대사 ${changed}개를 모두 처음 상태로 되돌리시겠습니까?`)) return;
    for (const m of state.messages) {
      if (isEdited(m)) revertMessage(m);
      m.deleted = false;
    }
    renderEditor();
    toast('모두 되돌렸습니다');
  });
}

/* ---------- 내보내기 ---------- */
function download() {
  const { body } = renderOutput();
  const href = webFontUrl(state.opts);
  const fontLink = href ? `<link rel="stylesheet" href="${esc(href)}">\n` : '';
  const page = `<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n${fontLink}<title>${esc(state.fileName)}</title>\n</head>\n<body style="margin:0;background:${state.opts.bg};">\n${body}\n</body>\n</html>\n`;
  saveFile(page, `${state.fileName}_변환.html`, 'text/html');
}

/** 에디터용 코드(복사 버튼과 같은 내용)를 텍스트 파일로 받는다 */
function downloadTxt() {
  const { body } = renderOutput();
  saveFile(body, `${state.fileName}_코드.txt`, 'text/plain');
}

function saveFile(content, name, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyCode() {
  const { body } = renderOutput();
  try {
    await navigator.clipboard.writeText(body);
    toast('코드를 복사했습니다. 에디터의 HTML 모드에 붙여넣으십시오');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = body;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('코드를 복사했습니다');
  }
}

/* =========================================================
 * 공통
 * ========================================================= */
function go(step) {
  if (step >= 2 && !state.messages.length) return;
  for (const n of [1, 2, 3]) $(`#step${n}`).hidden = n !== step;
  document.querySelectorAll('.stepper li').forEach((li) => {
    const n = +li.dataset.step;
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', n !== step && !!state.messages.length);
    li.classList.toggle('locked', n > 1 && !state.messages.length);
  });
  if (step === 1 && state.messages.length) {
    $('#parseStatus').textContent = `불러온 메시지 ${state.messages.length}개`;
  }
  // 3단계에서 테마나 글꼴을 바꿨을 수 있으니 분류 예시를 새로 그린다
  if (step === 2) { renderTypeCards(); renderTypePanel(); }
  if (step === 3) refreshStep3();
  window.scrollTo({ top: 0 });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function init() {
  Object.assign(state.opts, loadJSON(OPT_KEY) || {});
  const fonts = loadJSON(FONT_KEY);
  if (Array.isArray(fonts)) state.userFonts = fonts.filter((f) => f && f.id && f.name && FONT_GROUPS[f.group]);
  // 예전 '직접 입력' 글꼴은 내 글꼴로 옮긴다
  if (state.opts.fontFamily === 'custom') {
    const f = addUserFont(state.opts.fontCustom, 'gothic', false);
    state.opts.fontFamily = f ? f.id : '';
    saveJSON(OPT_KEY, state.opts);
  }
  state.types = loadTypes();
  saveTypes();

  const drop = $('#drop');
  $('#fileInput').addEventListener('change', (e) => readFile(e.target.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    readFile(e.dataTransfer.files[0]);
  });
  $('#parseBtn').addEventListener('click', handleParse);
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
  document.querySelectorAll('.stepper li').forEach((li) => li.addEventListener('click', () => go(+li.dataset.step)));
  $('#pasteInput').addEventListener('input', () => { $('#parseStatus').textContent = ''; });
  $('#downloadBtn').addEventListener('click', download);
  $('#copyBtn').addEventListener('click', copyCode);
  $('#txtBtn').addEventListener('click', downloadTxt);
  document.querySelectorAll('#charFilter [data-f]').forEach((b) => b.addEventListener('click', () => {
    state.charFilter = b.dataset.f;
    applyCharFilter();
  }));
  bindOptions();
  bindEditor();
  go(1);
}

init();
