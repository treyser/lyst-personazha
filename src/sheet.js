const $ = id => document.getElementById(id);
const STATS = ['str','int','dex','wis','con','cha'];

const state = {
  langs: ['Загальна'],
  attacks: [],
  spells: [],
  talents: [],
  gear: [],
  hpmax: 1,
  acbase: 10,
};

const RACES = ['Дворф','Ельф','Піврослик','Людина','Гном','Драконородний','Напівельф','Напіворк',
  'Тифлін','Ааракокра','Геназі','Голіаф','Аасимар','Багбер','Фірболг','Гоблін','Гобгоблін','Кенку',
  'Кобольд','Людоящер','Орк','Табаксі','Тритон','Юань-ті','Тортл','Ґіт','Локата','Грунг'];

const CLASSES = ['Бард','Боєць','Варвар','Винахідник','Друїд','Жрець','Заклинач','Злодій',
  'Монах','Паладин','Рейнджер','Чаклун','Чарівник'];

// [загальний досвід для рівня, бонус майстерності]
const LEVELS = [
  [0,2],[300,2],[900,2],[2700,2],[6500,3],[13000,3],[23000,3],[34000,3],[48000,4],[64000,4],
  [85000,4],[100000,4],[120000,5],[140000,5],[165000,5],[195000,5],[225000,6],[265000,6],
  [305000,6],[355000,6],
];

function fillSelect(id, items, blank){
  const sel = $(id);
  if(blank) sel.appendChild(new Option('—',''));
  items.forEach(i => sel.appendChild(new Option(i, i)));
}
fillSelect('ancestry', RACES);
fillSelect('class', CLASSES, true);

function renderXp(){
  const xp = Math.max(0, Number($('xp').value) || 0);
  let lvl = 1;
  for(let i = 0; i < LEVELS.length; i++) if(xp >= LEVELS[i][0]) lvl = i + 1;
  $('level').value = lvl;
  $('prof').textContent = fmt(LEVELS[lvl - 1][1]);
  $('xp-hint').textContent = lvl >= 20
    ? 'Максимальний рівень'
    : `До ${lvl + 1} рівня — ще ${(LEVELS[lvl][0] - xp).toLocaleString('uk')} досвіду`;
}

const mod = score => Math.floor((Number(score) - 10) / 2);
const fmt = n => (n >= 0 ? '+' : '') + n;

function renderStats(){
  STATS.forEach(s => $('m-' + s).textContent = fmt(mod($('s-' + s).value)));
  $('ac').textContent = state.acbase + mod($('s-dex').value);
  $('acbase-view').textContent = state.acbase;
  $('hpmax-view').textContent = state.hpmax;
  renderSlots();
}

// спорядження без обмеження — просто рахуємо, скільки речей несемо
function renderSlots(){
  const items = state.gear.reduce((sum, g) => sum + (Number(g.qty) || 0), 0);
  $('slots').textContent = items ? `(${items} шт.)` : '(порожньо)';
}

const ROWS = {
  attack:  { list:'attacks', fields:[['name','Назва'],['range','Дист.'],['hit','+0'],['damage','1к6']] },
  spell:   { list:'spells',  fields:[['name','Назва'],['tier','1'],['dice','2к8'],['range','Дотик'],['duration','Миттєва']] },
  talent:  { list:'talents', fields:[['name','Назва'],['desc','Що робить']] },
  gear:    { list:'gear',    fields:[['name','Предмет'],['qty','1'],['note','Нотатка']] },
};

function renderList(kind){
  const cfg = ROWS[kind];
  const tbody = $('t-' + cfg.list).querySelector('tbody');
  tbody.innerHTML = '';
  const items = state[cfg.list];
  if(!items.length){
    tbody.innerHTML = `<tr><td colspan="${cfg.fields.length + 1}" class="empty">Поки порожньо</td></tr>`;
    return;
  }
  items.forEach((item, i) => {
    const tr = document.createElement('tr');
    cfg.fields.forEach(([key, ph]) => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.value = item[key] ?? '';
      inp.placeholder = ph;
      inp.addEventListener('input', () => { item[key] = inp.value; if(kind === 'gear') renderSlots(); });
      td.appendChild(inp);
      tr.appendChild(td);
    });
    const td = document.createElement('td');
    td.className = 'rowtools';

    const up = document.createElement('button');
    up.className = 'move'; up.type = 'button'; up.textContent = '↑';
    up.title = 'Вище'; up.disabled = i === 0;
    up.addEventListener('click', () => moveItem(kind, i, -1));

    const down = document.createElement('button');
    down.className = 'move'; down.type = 'button'; down.textContent = '↓';
    down.title = 'Нижче'; down.disabled = i === items.length - 1;
    down.addEventListener('click', () => moveItem(kind, i, 1));

    const b = document.createElement('button');
    b.className = 'del'; b.type = 'button'; b.textContent = '×';
    b.title = 'Прибрати';
    b.addEventListener('click', () => { items.splice(i, 1); renderList(kind); renderSlots(); });

    td.append(up, down, b); tr.appendChild(td);
    tbody.appendChild(tr);
  });
}

// переставити рядок вище/нижче
function moveItem(kind, i, dir){
  const items = state[ROWS[kind].list];
  const j = i + dir;
  if(j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  renderList(kind);
  // повідомляємо, що дані змінились — щоб спрацював автозапис
  document.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderLangs(){
  const box = $('langs');
  box.innerHTML = '';
  state.langs.forEach((l, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = l;
    const b = document.createElement('button');
    b.className = 'del'; b.type = 'button'; b.textContent = '×';
    b.addEventListener('click', () => { state.langs.splice(i, 1); renderLangs(); });
    chip.appendChild(b);
    box.appendChild(chip);
  });
}

// події
STATS.forEach(s => $('s-' + s).addEventListener('input', renderStats));
['gp','sp','cp'].forEach(id => $(id).addEventListener('input', renderSlots));

document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.add;
    const blank = {};
    ROWS[kind].fields.forEach(([k]) => blank[k] = '');
    if(kind === 'gear') blank.qty = '1';
    state[ROWS[kind].list].push(blank);
    renderList(kind);
  });
});

$('lang-add').addEventListener('click', () => {
  const v = $('lang-new').value.trim();
  if(!v) return;
  state.langs.push(v);
  $('lang-new').value = '';
  renderLangs();
});
$('lang-new').addEventListener('keydown', e => { if(e.key === 'Enter') $('lang-add').click(); });

$('hpmax-plus').addEventListener('click', () => { state.hpmax++; renderStats(); });
$('hpmax-minus').addEventListener('click', () => { state.hpmax = Math.max(0, state.hpmax - 1); renderStats(); });
$('ac-plus').addEventListener('click', () => { state.acbase++; renderStats(); });
$('ac-minus').addEventListener('click', () => { state.acbase = Math.max(0, state.acbase - 1); renderStats(); });
$('rest').addEventListener('click', () => { $('hp').value = state.hpmax; });

$('xp').addEventListener('input', renderXp);

// збереження / завантаження
const FIELDS = ['name','ancestry','class','level','xp','title','alignment','background','deity','hp','gp','sp','cp'];

function collect(){
  const data = { ...state, stats:{} };
  STATS.forEach(s => data.stats[s] = $('s-' + s).value);
  FIELDS.forEach(f => data[f] = $(f).value);
  return data;
}

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(collect(), null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ($('name').value.trim() || 'персонаж') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('print').addEventListener('click', () => window.print());

$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if(!file) return;
  try{
    applyData(JSON.parse(await file.text()));
  }catch(err){
    alert('Не вдалося прочитати файл — схоже, це не лист персонажа.');
  }
  e.target.value = '';
});

const BLANK = { langs:[], attacks:[], spells:[], talents:[], gear:[], hpmax:1, acbase:10 };

function applyData(data){
  data = data ?? {};
  // спершу чистимо форму, щоб від попереднього листа нічого не лишилось
  STATS.forEach(s => $('s-' + s).value = 10);
  FIELDS.forEach(f => { const el = $(f); el.value = (el.type === 'number') ? 0 : ''; });
  $('hp').value = 1;
  Object.assign(state, BLANK, {
    langs: data.langs ?? [], attacks: data.attacks ?? [], spells: data.spells ?? [],
    talents: data.talents ?? [], gear: data.gear ?? [],
    hpmax: data.hpmax ?? 1, acbase: data.acbase ?? 10,
  });
  STATS.forEach(s => { if(data.stats?.[s] != null) $('s-' + s).value = data.stats[s]; });
  FIELDS.forEach(f => { if(data[f] != null) $(f).value = data[f]; });
  drawAll();
}

function drawAll(){
  renderStats();
  renderXp();
  Object.keys(ROWS).forEach(renderList);
  renderLangs();
}
drawAll();

// вкладки
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(b =>
      b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.panel').forEach(p =>
      p.hidden = p.id !== 'panel-' + btn.dataset.tab);
  });
});

export { collect, applyData, drawAll, state };
