'use strict';

/* =========================================================
 * 상태
 * ========================================================= */
const TYPES = { char: '인물', bold: '굵은 지문', thin: '얇은 지문', skip: '제외' };
const STORE_KEY = 'ccfolia-log-converter:chars';
const OPT_KEY = 'ccfolia-log-converter:opts';

const PRESETS = {
  light: { bg: '#ffffff', text: '#1f1f1f', narr: '#1f1f1f', dim: '#8a8a8e', line: '#e6e6e9' },
  dark: { bg: '#3a3a3c', text: '#f2f2f4', narr: '#bdbdc2', dim: '#a1a1a6', line: '#4f4f53' },
};

const DEFAULT_OPTS = {
  ...PRESETS.light,
  nameColor: 'text',
  avatar: 64,
  radius: '12',
  font: 15,
  merge: true,
  dimParen: true,
  dice: true,
  divider: true,
};

const state = {
  fileName: 'log',
  messages: [],   // {name, text, color}
  names: [],      // 등장 순서대로 화자 이름
  chars: {},      // name -> {type, display, color, img}
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
  if (!html.trim()) { toast('로그 HTML을 먼저 넣어주세요'); return; }
  const messages = parseLog(html);
  if (!messages.length) { toast('메시지를 찾지 못했어요. 코코포리아 로그 형식이 맞는지 확인해주세요'); return; }

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
  }
  state.chars = chars;
  renderStep2();
  go(2);
}

/* =========================================================
 * 2단계
 * ========================================================= */
function renderStep2() {
  const list = $('#charList');
  list.innerHTML = '';
  for (const name of state.names) list.append(buildCharRow(name));
}

function buildCharRow(name) {
  const c = state.chars[name];
  const msgs = state.messages.filter((m) => m.name === name);
  const row = document.createElement('div');
  row.className = 'char-row';

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
  row.querySelector('.sample').textContent = msgs.slice(0, 2).map((m) => m.text.replace(/\n/g, ' ')).join('  /  ');

  const sel = row.querySelector('.type');
  for (const [v, label] of Object.entries(TYPES)) sel.add(new Option(label, v, false, v === c.type));

  const display = row.querySelector('.display');
  const color = row.querySelector('.color');
  const url = row.querySelector('.url');
  const file = row.querySelector('.file');
  display.value = c.display;
  color.value = c.color || '#333333';
  url.value = c.img.startsWith('data:') ? '' : c.img;

  const refresh = () => {
    row.classList.toggle('is-char', c.type === 'char');
    row.classList.toggle('skip', c.type === 'skip');
    const av = row.querySelector('.avatar');
    av.style.backgroundImage = c.type === 'char' && c.img ? `url("${c.img.replace(/"/g, '%22')}")` : '';
    saveChars();
  };

  sel.addEventListener('change', () => { c.type = sel.value; refresh(); });
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
    } catch { toast('이미지를 읽지 못했어요'); }
    file.value = '';
  });
  row.querySelector('.clear').addEventListener('click', () => { c.img = ''; url.value = ''; refresh(); });

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
 * 출력 HTML 생성 (에디터 호환을 위해 인라인 스타일 + table)
 * ========================================================= */
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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

function diceCard(d) {
  const cell = 'padding:9px 16px;border-top:1px solid #dcdce0;text-align:left;';
  const label = `${cell}background:#ececef;color:#2b2b2e;font-weight:700;white-space:nowrap;border-right:1px solid #dcdce0;`;
  const value = `${cell}background:#ffffff;color:#1d1d1f;min-width:120px;`;
  let rows = d.rows.map(([k, v]) => `<tr><td style="${label}">${esc(k)}:</td><td style="${value}">${esc(v)}</td></tr>`).join('');
  if (d.result) {
    rows += `<tr><td style="${label}">판정결과:</td><td style="${value}background:${resultColor(d.result)};font-weight:700;">${esc(d.result)}</td></tr>`;
  } else {
    rows += `<tr><td style="${label}">결과:</td><td style="${value}font-weight:700;">${esc(d.total)}</td></tr>`;
  }
  return `<table style="border-collapse:separate;border-spacing:0;border:1px solid #dcdce0;border-radius:12px;overflow:hidden;margin:6px 0;font-size:0.95em;line-height:1.4;">`
    + `<tr><th colspan="2" style="padding:10px 16px;background:#1c1c1e;color:#ffffff;text-align:left;font-weight:700;">${esc(d.title)}</th></tr>`
    + rows + '</table>';
}

function renderLine(m, isChar, o) {
  // 판정 표는 인물이 굴린 주사위에만 쓰고, 지문은 원문 그대로 둔다
  const d = isChar && o.dice ? parseDice(m.text) : null;
  if (d) return diceCard(d);
  return formatText(m.text, isChar && o.dimParen ? o.dim : '');
}

function buildBlocks() {
  const o = state.opts;
  const blocks = [];
  let cur = null;
  for (const m of state.messages) {
    const c = state.chars[m.name];
    if (!c || c.type === 'skip') { continue; }
    if (c.type === 'char') {
      const key = `${c.display}\u0000${c.img}`;
      if (o.merge && cur && cur.key === key) {
        cur.lines.push(m);
      } else {
        cur = { type: 'char', key, c, lines: [m] };
        blocks.push(cur);
      }
    } else {
      cur = null;
      blocks.push({ type: c.type, lines: [m] });
    }
  }
  return blocks;
}

function renderOutput() {
  const o = state.opts;
  const S = +o.avatar;
  const radius = o.radius.endsWith('%') ? o.radius : `${o.radius}px`;
  const border = o.divider ? `border-bottom:1px solid ${o.line};` : '';
  const blocks = buildBlocks();

  const html = blocks.map((b) => {
    if (b.type === 'char') {
      const c = b.c;
      const nameColor = o.nameColor === 'char' ? c.color : o.text;
      const face = c.img
        ? `<img src="${esc(c.img)}" alt="${esc(c.display)}" width="${S}" height="${S}" style="width:${S}px;height:${S}px;border-radius:${radius};object-fit:cover;display:block;">`
        : `<div style="width:${S}px;height:${S}px;"></div>`;
      const lines = b.lines.map((m, i) => `<div style="margin:${i ? '8px' : '0'} 0 0;line-height:1.75;">${renderLine(m, true, o)}</div>`).join('');
      return `<table style="width:100%;border-collapse:collapse;${border}"><tr>`
        + `<td style="width:${S}px;vertical-align:top;padding:18px 0 18px 22px;">${face}</td>`
        + `<td style="vertical-align:top;padding:18px 22px 18px 16px;">`
        + `<div style="font-weight:700;font-size:1.05em;color:${nameColor};margin-bottom:6px;">${esc(c.display)}</div>`
        + lines + '</td></tr></table>';
    }
    const weight = b.type === 'bold' ? '700' : '400';
    return `<div style="text-align:center;padding:16px 22px;line-height:1.75;color:${o.narr};font-weight:${weight};${border}">${renderLine(b.lines[0], false, o)}</div>`;
  }).join('\n');

  const body = `<div style="background:${o.bg};color:${o.text};font-size:${o.font}px;font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;word-break:keep-all;overflow-wrap:anywhere;">\n${html}\n</div>`;
  return { body, count: blocks.length };
}

/* =========================================================
 * 3단계
 * ========================================================= */
function bindOptions() {
  const o = state.opts;
  const colorIds = ['bg', 'text', 'narr', 'dim', 'line'];
  const sync = () => {
    for (const k of colorIds) $(`#o-${k}`).value = o[k];
    $('#o-nameColor').value = o.nameColor;
    $('#o-avatar').value = o.avatar;
    $('#o-avatarVal').textContent = `${o.avatar}px`;
    $('#o-radius').value = o.radius;
    $('#o-font').value = o.font;
    $('#o-fontVal').textContent = `${o.font}px`;
    for (const k of ['merge', 'dimParen', 'dice', 'divider']) $(`#o-${k}`).checked = o[k];
  };
  const update = () => { saveJSON(OPT_KEY, o); sync(); renderPreview(); };

  for (const k of colorIds) $(`#o-${k}`).addEventListener('input', (e) => { o[k] = e.target.value; update(); });
  for (const k of ['nameColor', 'radius']) $(`#o-${k}`).addEventListener('change', (e) => { o[k] = e.target.value; update(); });
  for (const k of ['avatar', 'font']) $(`#o-${k}`).addEventListener('input', (e) => { o[k] = +e.target.value; update(); });
  for (const k of ['merge', 'dimParen', 'dice', 'divider']) $(`#o-${k}`).addEventListener('change', (e) => { o[k] = e.target.checked; update(); });
  document.querySelectorAll('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
    Object.assign(o, PRESETS[btn.dataset.preset]);
    update();
  }));
  sync();
}

function renderPreview() {
  const { body, count } = renderOutput();
  $('#preview').innerHTML = body;
  $('#stats').textContent = `· 블록 ${count}개 · ${(new Blob([body]).size / 1024).toFixed(0)}KB`;
}

function download() {
  const { body } = renderOutput();
  const page = `<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${esc(state.fileName)}</title>\n</head>\n<body style="margin:0;background:${state.opts.bg};">\n${body}\n</body>\n</html>\n`;
  const blob = new Blob([page], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.fileName}_변환.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyCode() {
  const { body } = renderOutput();
  try {
    await navigator.clipboard.writeText(body);
    toast('코드를 복사했어요. 에디터의 HTML 모드에 붙여넣으세요');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = body;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('코드를 복사했어요');
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
    $('#parseStatus').textContent = `불러온 메시지 ${state.messages.length}개 · 로그를 바꾸지 않고 다음을 눌러도 화자 설정은 그대로 남아요`;
  }
  if (step === 3) renderPreview();
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
  bindOptions();
  go(1);
}

init();
