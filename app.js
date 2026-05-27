const HEADER_TOKENS = ["Who", "When", "Where", "First In", "Last Out", "Active Hrs", "Idle Hrs", "Total Hrs"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_DAY_SECONDS = 9 * 3600;
const HALF_DAY_SECONDS = 4 * 3600;
const DEPT_STORAGE_KEY = 'adaudit-tool-departments';

let state = {
  records: [], users: [], dates: [], period: null,
  monThuKeys: [], fridayKey: null,
  departments: loadDepartments(), // { username (lower): "Department" }
};

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const metaEl     = document.getElementById('meta');
const tableWrap  = document.getElementById('table-wrap');
const controls   = document.getElementById('controls');
const top10El    = document.getElementById('top10');
const top10List  = document.getElementById('top10-list');
const sortBy     = document.getElementById('sort-by');
const filterInp  = document.getElementById('filter');
const statsStrip = document.getElementById('stats-strip');
const tabsEl     = document.getElementById('tabs');
const deptInput  = document.getElementById('dept-input');
const deptStatus = document.getElementById('dept-status');

['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', e => {
  const file = e.dataTransfer.files[0];
  if (file) dispatchFile(file);
});
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) dispatchFile(file);
});
deptInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleDepartmentsFile(file).then(() => { deptInput.value = ''; });
});
document.getElementById('dept-template').addEventListener('click', e => {
  e.preventDefault();
  downloadDeptTemplate();
});
document.getElementById('dept-template-inline').addEventListener('click', e => {
  e.preventDefault();
  downloadDeptTemplate();
});
document.getElementById('dept-clear').addEventListener('click', e => {
  e.preventDefault();
  if (!Object.keys(state.departments).length) return;
  if (!confirm('Clear all department mappings?')) return;
  state.departments = {};
  saveDepartments({});
  updateDeptStatus();
  if (state.records.length) render();
});

function dispatchFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'csv') return handleDepartmentsFile(file);
  if (ext === 'xlsx' || ext === 'xlsm') return handleFile(file);
  alert('Unsupported file: ' + file.name + '\nDrop a .xlsx (work hours) or .csv (departments).');
}

sortBy.addEventListener('change', render);
filterInp.addEventListener('input', render);

document.getElementById('clear').addEventListener('click', () => {
  state = { records: [], users: [], dates: [], period: null, monThuKeys: [], fridayKey: null, departments: state.departments };
  metaEl.textContent = '';
  tableWrap.classList.add('hidden');
  controls.classList.add('hidden');
  top10El.classList.add('hidden');
  statsStrip.classList.add('hidden');
  tabsEl.classList.add('hidden');
  fileInput.value = '';
  switchTab('overview');
  updateDeptStatus();
});

document.getElementById('export-csv').addEventListener('click', exportCsv);

// tab switching
tabsEl.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// stat-card clicks
statsStrip.querySelectorAll('.stat-card').forEach(card => {
  card.addEventListener('click', () => {
    const target = card.dataset.target;
    if (target) switchTab(target);
  });
});

function switchTab(name) {
  tabsEl.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + name);
  });
}

function loadDepartments() {
  try {
    const raw = localStorage.getItem(DEPT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveDepartments(map) {
  try { localStorage.setItem(DEPT_STORAGE_KEY, JSON.stringify(map)); } catch {}
}

function deptFor(user) {
  return state.departments[user.toLowerCase()] || '';
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const map = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // skip header row (heuristic: contains "username" or "department" case-insensitive in first row only)
    if (i === 0 && /username|department/i.test(line)) continue;
    // split on comma; quoted values supported minimally
    const parts = splitCsvLine(line);
    if (parts.length < 2) continue;
    const user = parts[0].trim();
    const dept = parts[1].trim();
    if (!user || !dept) continue;
    map[user.toLowerCase()] = dept;
  }
  return map;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function handleDepartmentsFile(file) {
  try {
    const text = await file.text();
    const map = parseCsv(text);
    if (Object.keys(map).length === 0) {
      alert('No rows parsed from CSV. Expected format:\n\nusername,department\nageiger,IT\nakerr,Accounting');
      return;
    }
    state.departments = map;
    saveDepartments(map);
    updateDeptStatus();
    if (state.records.length) render();
  } catch (err) {
    console.error(err);
    alert('Could not read the CSV file:\n' + err.message);
  }
}

function updateDeptStatus() {
  const mapped = Object.keys(state.departments).length;
  if (mapped === 0) {
    deptStatus.textContent = 'Departments: not loaded';
    deptStatus.classList.remove('loaded');
    return;
  }
  if (state.users.length === 0) {
    deptStatus.textContent = `Departments: ${mapped} mapped`;
  } else {
    const inFile = state.users.filter(u => deptFor(u)).length;
    const missing = state.users.length - inFile;
    deptStatus.textContent = missing > 0
      ? `Departments: ${inFile} of ${state.users.length} mapped (${missing} missing)`
      : `Departments: all ${state.users.length} mapped`;
  }
  deptStatus.classList.add('loaded');
}

function downloadDeptTemplate() {
  let rows = ['username,department'];
  // if we have users loaded, include them so user can fill in departments
  if (state.users.length) {
    for (const u of state.users) {
      const existing = deptFor(u);
      rows.push(`${csvEscape(u)},${csvEscape(existing)}`);
    }
  } else {
    rows.push('ageiger,IT');
    rows.push('akerr,Accounting');
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'departments.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function handleFile(file) {
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    parseWorkbook(wb);
    render();
    tableWrap.classList.remove('hidden');
    controls.classList.remove('hidden');
    top10El.classList.remove('hidden');
    statsStrip.classList.remove('hidden');
    tabsEl.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    alert('Could not parse the file. Make sure it is an ADAudit "User Work Hours" .xlsx export.\n\n' + err.message);
  }
}

function timeToSeconds(s) {
  if (s == null || s === '') return 0;
  const m = String(s).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}

function fmtSeconds(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseWorkbook(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let period = null;
  const records = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (period === null && typeof row[0] === 'string' && row[0].startsWith('Period :')) {
      period = row[0].replace('Period :', '').trim();
    }
    let isHeader = true;
    for (let j = 0; j < HEADER_TOKENS.length; j++) {
      if (String(row[j] ?? '').trim() !== HEADER_TOKENS[j]) { isHeader = false; break; }
    }
    if (!isHeader) continue;
    const sr = rows[i + 1] || [];
    const user = String(sr[0] ?? '').trim();
    const date = parseDate(sr[1]);
    if (!user || !date) continue;
    records.push({
      user,
      date,
      dateKey: dateKey(date),
      machine: String(sr[2] ?? '').trim(),
      firstIn: String(sr[3] ?? '').trim(),
      lastOut: String(sr[4] ?? '').trim(),
      active: timeToSeconds(sr[5]),
      idle:   timeToSeconds(sr[6]),
      total:  timeToSeconds(sr[7]),
    });
    i++;
  }

  const users = [...new Set(records.map(r => r.user))].sort((a, b) => a.localeCompare(b));
  const dateKeys = [...new Set(records.map(r => r.dateKey))].sort();
  const dates = dateKeys.map(k => {
    const [y, mo, d] = k.split('-').map(Number);
    return new Date(y, mo - 1, d);
  });
  const monThuKeys = dates.filter(d => d.getDay() >= 1 && d.getDay() <= 4).map(dateKey);
  const fridayDate = dates.find(d => d.getDay() === 5);
  const fridayKey = fridayDate ? dateKey(fridayDate) : null;

  state = { ...state, records, users, dates, period, monThuKeys, fridayKey };

  const parts = [];
  if (period) parts.push(period);
  parts.push(`${records.length} records`);
  parts.push(`${users.length} users`);
  parts.push(`${dates.length} days`);
  metaEl.textContent = parts.join(' • ');
  updateDeptStatus();
}

function dayLabel(d) {
  const dow = DAYS[(d.getDay() + 6) % 7];
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${dow} ${month} ${d.getDate()}`;
}

// Build full aggregates (no filter/sort) for the new views
function buildFullAggregates() {
  const map = new Map();
  for (const user of state.users) map.set(user, { user, byDate: {}, active: 0, idle: 0, total: 0 });
  for (const rec of state.records) {
    const a = map.get(rec.user);
    a.byDate[rec.dateKey] = rec;
    a.active += rec.active;
    a.idle += rec.idle;
    a.total += rec.total;
  }
  return [...map.values()];
}

function qualifiesForHalfDay(agg) {
  if (state.monThuKeys.length !== 4) return false;
  for (const k of state.monThuKeys) {
    const r = agg.byDate[k];
    if (!r || r.total < SHORT_DAY_SECONDS) return false;
  }
  return true;
}

function shortMonThuDays(agg) {
  const result = [];
  for (const k of state.monThuKeys) {
    const r = agg.byDate[k];
    if (!r || r.total < SHORT_DAY_SECONDS) {
      const [y, mo, d] = k.split('-').map(Number);
      const date = new Date(y, mo - 1, d);
      result.push({ key: k, date, total: r ? r.total : 0 });
    }
  }
  return result;
}

function aggregatesForRender() {
  const filter = filterInp.value.trim().toLowerCase();
  const aggs = buildFullAggregates().filter(a => !filter || a.user.toLowerCase().includes(filter));
  const sort = sortBy.value;
  aggs.sort((a, b) => {
    switch (sort) {
      case 'active-desc': return b.active - a.active;
      case 'active-asc':  return a.active - b.active;
      case 'idle-desc':   return b.idle - a.idle;
      case 'total-desc':  return b.total - a.total;
      case 'dept': {
        const da = deptFor(a.user) || '￿';
        const db = deptFor(b.user) || '￿';
        return da.localeCompare(db) || a.user.localeCompare(b.user);
      }
      case 'dept-total-desc': {
        const da = deptFor(a.user) || '￿';
        const db = deptFor(b.user) || '￿';
        return da.localeCompare(db) || (b.total - a.total);
      }
      default:            return a.user.localeCompare(b.user);
    }
  });
  return aggs;
}

function render() {
  if (!state.records.length) return;
  renderStats();
  renderTop10();
  renderTable();
  renderAttention();
  renderEarned();
}

function renderStats() {
  const aggs = buildFullAggregates();
  const earned = aggs.filter(qualifiesForHalfDay);
  const shortMonThu = aggs.filter(a => shortMonThuDays(a).length > 0);
  const failedFri = earned.filter(a => {
    if (!state.fridayKey) return false;
    const r = a.byDate[state.fridayKey];
    return !r || r.total < HALF_DAY_SECONDS;
  });
  document.getElementById('stat-users').textContent = state.users.length;
  document.getElementById('stat-earned').innerHTML = `<span class="stat-icon">&#9733;</span> ${earned.length}`;
  document.getElementById('stat-short').textContent = shortMonThu.length;
  document.getElementById('stat-failed').textContent = failedFri.length;
  document.getElementById('tab-attention-badge').textContent = shortMonThu.length + failedFri.length;
  document.getElementById('tab-earned-badge').textContent = earned.length;
}

function renderTop10() {
  const all = buildFullAggregates()
    .map(a => ({ user: a.user, total: a.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  top10List.innerHTML = '';
  const max = all[0]?.total || 1;
  for (const { user, total } of all) {
    const li = document.createElement('li');
    const pct = Math.round((total / max) * 100);
    li.innerHTML = `
      <span class="t10-user">${escapeHtml(user)}</span>
      <span class="t10-bar"><span class="t10-bar-fill" style="width:${pct}%"></span></span>
      <span class="t10-val">${fmtSeconds(total)}</span>
    `;
    top10List.appendChild(li);
  }
}

function renderTable() {
  const thead = document.querySelector('#table thead');
  const tbody = document.querySelector('#table tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const dates = state.dates;

  const tr1 = document.createElement('tr');
  let h1 = '<th class="user-col" rowspan="2">User</th>';
  h1 += '<th class="dept-col" rowspan="2">Department</th>';
  for (const d of dates) {
    h1 += `<th class="day-header" rowspan="2">${escapeHtml(dayLabel(d))}</th>`;
  }
  h1 += `<th colspan="3" class="week-divider">Weekly Totals</th>`;
  tr1.innerHTML = h1;
  thead.appendChild(tr1);

  const tr2 = document.createElement('tr');
  let h2 = '';
  h2 += `<th class="sub-header active-v week-divider">Active</th>`;
  h2 += `<th class="sub-header idle-v">Idle</th>`;
  h2 += `<th class="sub-header">Total</th>`;
  tr2.innerHTML = h2;
  thead.appendChild(tr2);

  const aggs = aggregatesForRender();
  const frag = document.createDocumentFragment();
  for (const agg of aggs) {
    const tr = document.createElement('tr');
    const earnedHalfDay = qualifiesForHalfDay(agg);
    const star = earnedHalfDay
      ? `<span class="half-day-star" title="Earned half-day Friday: 9+ hrs Mon-Thu">&#9733;</span>`
      : '';
    const dept = deptFor(agg.user);
    const deptHtml = dept
      ? `<td class="dept-col">${escapeHtml(dept)}</td>`
      : `<td class="dept-col unmapped">&mdash;</td>`;
    let html = `<td class="user-col">${escapeHtml(agg.user)}${star}</td>${deptHtml}`;
    for (const d of dates) {
      const k = dateKey(d);
      const r = agg.byDate[k];
      const isFriday = k === state.fridayKey;
      const isMonThu = d.getDay() >= 1 && d.getDay() <= 4;
      const friTotal = r ? r.total : 0;
      const friShort = isFriday && friTotal < HALF_DAY_SECONDS;
      const friTitle = friShort
        ? (earnedHalfDay
            ? ' title="Earned half-day but worked less than 4 hours"'
            : (!r ? ' title="No Friday record (under 4 hours)"' : ' title="Friday under 4 hours"'))
        : '';
      if (r) {
        const classes = ['total-v'];
        if (isMonThu && r.total > 0 && r.total < SHORT_DAY_SECONDS) classes.push('short');
        if (friShort) classes.push('fri-red');
        html += `<td class="${classes.join(' ')}"${friTitle}>${fmtSeconds(r.total)}</td>`;
      } else if (friShort) {
        html += `<td class="total-v fri-red"${friTitle}>0:00:00</td>`;
      } else {
        html += `<td class="empty">&middot;</td>`;
      }
    }
    html += `<td class="weekly active-v week-divider-left">${fmtSeconds(agg.active)}</td>`;
    html += `<td class="weekly idle-v">${fmtSeconds(agg.idle)}</td>`;
    html += `<td class="weekly total-v">${fmtSeconds(agg.total)}</td>`;
    tr.innerHTML = html;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

function renderAttention() {
  const content = document.getElementById('attention-content');
  content.innerHTML = '';
  const aggs = buildFullAggregates();

  // Group 1: Short Mon-Thu (any day under 9 hrs)
  const shortGroup = aggs
    .map(a => {
      const shorts = shortMonThuDays(a);
      if (shorts.length === 0) return null;
      const deficit = shorts.reduce((acc, d) => acc + Math.max(0, SHORT_DAY_SECONDS - d.total), 0);
      return { user: a.user, shorts, deficit };
    })
    .filter(Boolean)
    .sort((a, b) => a.user.localeCompare(b.user));

  // Group 2: Earned half-day but Friday < 4 hrs
  const failedGroup = aggs
    .filter(qualifiesForHalfDay)
    .map(a => {
      if (!state.fridayKey) return null;
      const r = a.byDate[state.fridayKey];
      const friTotal = r ? r.total : 0;
      if (friTotal >= HALF_DAY_SECONDS) return null;
      return { user: a.user, friTotal, deficit: HALF_DAY_SECONDS - friTotal };
    })
    .filter(Boolean)
    .sort((a, b) => a.user.localeCompare(b.user));

  if (shortGroup.length === 0 && failedGroup.length === 0) {
    content.innerHTML = `<div class="empty-state">Nobody to flag &mdash; everyone met the bar this week. &#127881;</div>`;
    return;
  }

  // Group 1 render
  if (shortGroup.length > 0) {
    const g1 = document.createElement('div');
    g1.className = 'attention-group warn';
    g1.innerHTML = `
      <div class="attention-group-header">
        <h3 class="attention-group-title">Short Mon&ndash;Thu Days</h3>
        <p class="attention-group-desc">At least one weekday under 9 hours. Did not earn the half-day.</p>
        <span class="attention-group-count">${shortGroup.length} ${shortGroup.length === 1 ? 'user' : 'users'}</span>
      </div>
      <table class="attention-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Department</th>
            <th class="right">Short Days</th>
            <th>Which Days</th>
            <th class="right">Total Deficit</th>
          </tr>
        </thead>
        <tbody>
          ${shortGroup.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.user)}</strong></td>
              <td>${deptFor(r.user) ? escapeHtml(deptFor(r.user)) : '<span class="dept-col unmapped">—</span>'}</td>
              <td class="right">${r.shorts.length} of 4</td>
              <td>
                <span class="short-days">
                  ${r.shorts.map(s => {
                    const dow = DAYS[(s.date.getDay() + 6) % 7];
                    return `<span class="pill" title="${fmtSeconds(s.total) || '0:00:00'}">${dow}: ${fmtSeconds(s.total) || '—'}</span>`;
                  }).join('')}
                </span>
              </td>
              <td class="right deficit">${fmtSeconds(r.deficit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    content.appendChild(g1);
  }

  // Group 2 render
  if (failedGroup.length > 0) {
    const g2 = document.createElement('div');
    g2.className = 'attention-group danger';
    g2.innerHTML = `
      <div class="attention-group-header">
        <h3 class="attention-group-title">Failed Friday Half-Day</h3>
        <p class="attention-group-desc">Earned the half-day (9+ hrs Mon&ndash;Thu) but worked less than 4 hours Friday.</p>
        <span class="attention-group-count">${failedGroup.length} ${failedGroup.length === 1 ? 'user' : 'users'}</span>
      </div>
      <table class="attention-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Department</th>
            <th class="right">Friday Actual</th>
            <th class="right">Required</th>
            <th class="right">Deficit</th>
          </tr>
        </thead>
        <tbody>
          ${failedGroup.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.user)}</strong> <span class="half-day-star">&#9733;</span></td>
              <td>${deptFor(r.user) ? escapeHtml(deptFor(r.user)) : '<span class="dept-col unmapped">—</span>'}</td>
              <td class="right actual">${fmtSeconds(r.friTotal) || '0:00:00'}</td>
              <td class="right">4:00:00</td>
              <td class="right deficit">${fmtSeconds(r.deficit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    content.appendChild(g2);
  }
}

function renderEarned() {
  const content = document.getElementById('earned-content');
  content.innerHTML = '';
  const aggs = buildFullAggregates().filter(qualifiesForHalfDay);
  if (aggs.length === 0) {
    content.innerHTML = `<div class="empty-state">No users earned the half-day this week.</div>`;
    return;
  }
  aggs.sort((a, b) => a.user.localeCompare(b.user));

  const monThuLabels = state.monThuKeys.map(k => {
    const [y, mo, d] = k.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    return DAYS[(dt.getDay() + 6) % 7];
  });

  const monThuHeaders = monThuLabels.map(l => `<th class="right">${l}</th>`).join('');
  const friHeader = state.fridayKey ? `<th class="right">Fri</th><th class="right">Status</th>` : '';

  const wrap = document.createElement('div');
  wrap.className = 'attention-group';
  wrap.innerHTML = `
    <div class="attention-group-header">
      <h3 class="attention-group-title"><span class="half-day-star">&#9733;</span> Earned Half-Day</h3>
      <p class="attention-group-desc">Worked 9+ hours each day Mon&ndash;Thu.</p>
      <span class="attention-group-count">${aggs.length} ${aggs.length === 1 ? 'user' : 'users'}</span>
    </div>
    <table class="attention-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Department</th>
          ${monThuHeaders}
          ${friHeader}
          <th class="right">Weekly Total</th>
        </tr>
      </thead>
      <tbody>
        ${aggs.map(a => {
          const friRec = state.fridayKey ? a.byDate[state.fridayKey] : null;
          const friTotal = friRec ? friRec.total : 0;
          const friOk = !state.fridayKey || friTotal >= HALF_DAY_SECONDS;
          const friCell = state.fridayKey
            ? `<td class="right ${friOk ? '' : 'deficit'}">${fmtSeconds(friTotal) || '0:00:00'}</td>
               <td class="right">${friOk ? '<span style="color:#1e7f3d;font-weight:700;">&#10003; OK</span>' : '<span style="color:#b91c1c;font-weight:700;">&#10005; Short</span>'}</td>`
            : '';
          const monThuCells = state.monThuKeys.map(k => {
            const r = a.byDate[k];
            return `<td class="right">${r ? fmtSeconds(r.total) : '—'}</td>`;
          }).join('');
          return `<tr>
            <td><strong>${escapeHtml(a.user)}</strong></td>
            <td>${deptFor(a.user) ? escapeHtml(deptFor(a.user)) : '<span class="dept-col unmapped">—</span>'}</td>
            ${monThuCells}
            ${friCell}
            <td class="right actual">${fmtSeconds(a.total)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  content.appendChild(wrap);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function exportCsv() {
  if (!state.records.length) return;
  const dates = state.dates;
  const headers = ['User', 'Department'];
  for (const d of dates) headers.push(dayLabel(d));
  headers.push('Weekly Active', 'Weekly Idle', 'Weekly Total');

  const lines = [headers.map(csvEscape).join(',')];
  for (const agg of aggregatesForRender()) {
    const cells = [csvEscape(agg.user), csvEscape(deptFor(agg.user))];
    for (const d of dates) {
      const r = agg.byDate[dateKey(d)];
      cells.push(r ? fmtSeconds(r.total) : '');
    }
    cells.push(fmtSeconds(agg.active), fmtSeconds(agg.idle), fmtSeconds(agg.total));
    lines.push(cells.map(csvEscape).join(','));
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'work_hours_summary.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(s) {
  s = s == null ? '' : String(s);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// initial dept status (in case any was loaded from localStorage)
updateDeptStatus();

// Auto-load departments.csv from the project folder when served via http/https.
// (file:// can't fetch local files, so this no-ops in that case — drag the CSV in instead.)
(async function tryAutoLoadDepartments() {
  if (location.protocol === 'file:') return;
  try {
    const r = await fetch('departments.csv', { cache: 'no-cache' });
    if (!r.ok) return;
    const text = await r.text();
    const map = parseCsv(text);
    if (Object.keys(map).length === 0) return;
    state.departments = map;
    saveDepartments(map);
    updateDeptStatus();
    if (state.records.length) render();
    console.log(`Auto-loaded ${Object.keys(map).length} department mappings from departments.csv`);
  } catch (err) {
    // silent — file isn't there or fetch blocked
  }
})();
