const form = document.getElementById('seatingForm');
let catalog;
let serverMode = false;
let imported = false;
let currentPlan = null;
const palette = ['#e3edff', '#ffe8d4', '#def3e7', '#f1e3fb', '#fff5cc', '#ddf4f7'];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function message(text, error = false) {
  const node = document.getElementById('message');
  node.textContent = text;
  node.className = `message ${error ? 'error' : 'success'}`;
  node.hidden = !text;
}

function clearResults() {
  currentPlan = null;
  document.getElementById('results').style.display = 'none';
}

function showCatalog() {
  clearResults();
  const divisions = [...new Set(catalog.students.map(s => s.division))].sort();
  document.getElementById('divisionSearch').value = '';
  document.getElementById('roomSearch').value = '';
  const departmentFilter = document.getElementById('departmentFilter');
  departmentFilter.replaceChildren();
  const allOption = element('option', 'All departments'); allOption.value = ''; departmentFilter.append(allOption);
  for (const department of [...new Set(divisions.map(AdminSelection.department))].sort()) {
    const option = element('option', department); option.value = department; departmentFilter.append(option);
  }
  const divisionOptions = document.getElementById('divisionOptions');
  divisionOptions.replaceChildren();
  for (const division of divisions) {
    const label = element('label', undefined, 'option-card');
    const input = element('input');
    input.type = 'checkbox'; input.name = 'division'; input.value = division;
    label.append(input, element('span', `${division} (${catalog.students.filter(s => s.division === division).length})`));
    divisionOptions.append(label);
  }
  const roomOptions = document.getElementById('roomOptions');
  roomOptions.replaceChildren();
  for (const room of catalog.rooms) {
    const label = element('label', undefined, 'option-card');
    const input = element('input');
    input.type = 'checkbox'; input.name = 'room'; input.value = String(room.room_id);
    label.append(input, element('span', `Room ${room.room_number} · ${room.rows} × ${room.columns} · ${room.capacity} seats`));
    roomOptions.append(label);
  }
  document.getElementById('dataSource').textContent = imported ? 'Imported CSV · browser allocation' : `${catalog.source} · ${serverMode ? 'backend allocation' : 'browser allocation'}`;
  document.getElementById('dataDetails').textContent = `${catalog.students.length} students, ${catalog.rooms.length} rooms. ${catalog.source === 'Sample data' ? 'Synthetic records for demonstration.' : imported ? 'Imported records are not saved to MySQL.' : 'Student and room records loaded from MySQL.'}`;
  filterOptions();
  updateSelection();
}

async function loadCatalog() {
  imported = false;
  serverMode = false;
  catalog = { ...DemoData };
  if (location.protocol !== 'file:') {
    try {
      const response = await fetch('/api/catalog');
      if (response.status === 401) { location.replace('/login.html'); return; }
      if (!response.ok) throw new Error('Could not load catalog');
      catalog = await response.json();
      serverMode = true;
    } catch (error) {
      // If a backend serves this app, database errors must stay visible.
      if (location.port === '3000') {
        message('Backend catalog could not be loaded. Check the server and database settings. Sample data is available for a browser-only demo.', true);
      }
    }
  }
  showCatalog();
}

function selected(name) { return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(n => n.value); }

function filterOptions() {
  const query = document.getElementById('divisionSearch').value;
  const department = document.getElementById('departmentFilter').value;
  for (const label of document.querySelectorAll('#divisionOptions .option-card')) label.hidden = !AdminSelection.matchesDivision(label.querySelector('input').value, query, department);
  const roomQuery = document.getElementById('roomSearch').value.trim().toLowerCase();
  for (const label of document.querySelectorAll('#roomOptions .option-card')) label.hidden = !label.textContent.toLowerCase().includes(roomQuery);
  document.getElementById('divisionNoMatches').hidden = [...document.querySelectorAll('#divisionOptions .option-card')].some(n => !n.hidden);
  document.getElementById('roomNoMatches').hidden = [...document.querySelectorAll('#roomOptions .option-card')].some(n => !n.hidden);
}

function updateSelection() {
  for (const [name, masterId, countId, noun] of [['division', 'allDivisions', 'divisionCount', 'classes'], ['room', 'allRooms', 'roomCount', 'rooms']]) {
    const inputs = [...form.querySelectorAll(`input[name="${name}"]`)];
    const chosen = inputs.filter(n => n.checked);
    const hiddenChosen = chosen.filter(n => n.parentElement.hidden).length;
    const master = document.getElementById(masterId);
    master.checked = inputs.length > 0 && chosen.length === inputs.length;
    master.indeterminate = chosen.length > 0 && chosen.length < inputs.length;
    document.getElementById(countId).textContent = `${chosen.length} of ${inputs.length} ${noun} selected${hiddenChosen ? ` (${hiddenChosen} outside this filter)` : ''}`;
    for (const input of inputs) input.parentElement.classList.toggle('is-selected', input.checked);
  }
  if (!catalog) return;
  const totals = AdminSelection.totals(catalog.students, catalog.rooms, selected('division'), selected('room'));
  const summary = document.getElementById('selectionSummary');
  const ready = selected('division').length > 0 && selected('room').length > 0;
  summary.textContent = ready ? `${totals.students} students · ${totals.capacity} available seats · ${totals.capacity >= totals.students ? `${totals.capacity - totals.students} spare seats` : `${totals.students - totals.capacity} more seats needed`}` : `${totals.students} students · ${totals.capacity} available seats. Choose at least one class and room.`;
  summary.classList.toggle('capacity-error', ready && totals.students > totals.capacity);
}

function chooseBulk(name, action) {
  const inputs = [...form.querySelectorAll(`input[name="${name}"]`)];
  const chosen = AdminSelection.bulkSelection(inputs.map(n => n.value), selected(name), action, inputs.filter(n => !n.parentElement.hidden).map(n => n.value));
  for (const input of inputs) input.checked = chosen.has(input.value);
  clearResults(); updateSelection();
}
document.getElementById('allDivisions').addEventListener('change', event => chooseBulk('division', event.target.checked ? 'all' : 'clear'));
document.getElementById('allRooms').addEventListener('change', event => chooseBulk('room', event.target.checked ? 'all' : 'clear'));
document.getElementById('selectShownDivisions').addEventListener('click', () => chooseBulk('division', 'shown'));
document.getElementById('selectShownRooms').addEventListener('click', () => chooseBulk('room', 'shown'));
document.getElementById('clearDivisions').addEventListener('click', () => chooseBulk('division', 'clear'));
document.getElementById('clearRooms').addEventListener('click', () => chooseBulk('room', 'clear'));
for (const id of ['divisionSearch', 'departmentFilter', 'roomSearch']) document.getElementById(id).addEventListener('input', () => { filterOptions(); updateSelection(); });
form.addEventListener('change', event => {
  if (['divisionSearch', 'departmentFilter', 'roomSearch'].includes(event.target.id)) return;
  clearResults(); updateSelection();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  clearResults();
  message('');
  if (!form.reportValidity()) return;
  const request = {
    examName: document.getElementById('examName').value.trim(),
    examDate: document.getElementById('examDate').value,
    examTime: document.getElementById('examTime').value,
    divisions: selected('division'), rooms: selected('room'), seatingType: selected('seatingType')[0]
  };
  if (!request.examName || !request.divisions.length || !request.rooms.length) {
    message('Enter an exam name and select at least one division and room.', true); return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Generating...';
  try {
    let plan;
    if (serverMode && !imported) {
      const response = await fetch('/api/arrangements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const result = await response.json();
      if (response.status === 401) { location.replace('/login.html'); return; }
      if (!response.ok) throw new Error(result.error || 'Generation failed');
      plan = result;
    } else {
      // Yield once so the generating state can appear before bounded search.
      await new Promise(resolve => setTimeout(resolve, 25));
      const students = catalog.students.filter(s => request.divisions.includes(s.division));
      const rooms = catalog.rooms.filter(r => request.rooms.includes(String(r.room_id)));
      plan = SeatingAllocator.allocate(students, rooms, request.seatingType);
      plan.exam = request;
      plan.source = imported ? 'Imported CSV' : 'Sample data';
      plan.persistence = 'Browser memory only';
    }
    currentPlan = plan;
    render(plan);
    message(`All ${plan.stats.students} students seated. ${plan.persistence}.`);
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false; button.textContent = 'Generate Seating Arrangement';
  }
});

function render(plan) {
  const dateParts = plan.exam.examDate.split('-');
  document.getElementById('examSummary').textContent = `${plan.exam.examName} · ${dateParts.reverse().join('/')} · ${plan.exam.examTime} · ${plan.strategy === 'column' ? 'Column-Based' : 'Fully Shuffled'} · ${plan.source}`;
  const stats = document.getElementById('statistics');
  stats.replaceChildren();
  for (const [label, value] of [['Students', plan.stats.students], ['Capacity', plan.stats.capacity], ['Empty seats', plan.stats.emptySeats], ['Search time', `${plan.stats.elapsedMs} ms`]]) {
    const item = element('div', undefined, 'stat');
    item.append(element('strong', String(value)), element('span', label)); stats.append(item);
  }
  document.getElementById('validationSummary').textContent = `Validation passed: each student appears once, each occupied seat is unique, and there are zero adjacency conflicts. Graph: ${plan.stats.vertices} vertices, ${plan.stats.edges} edges. Backtracks: ${plan.stats.backtracks}.`;
  const divisions = [...new Set(plan.seats.map(s => s.division))].sort();
  const colors = new Map(divisions.map((d, i) => [d, palette[i % palette.length]]));
  const legend = document.getElementById('legend'); legend.replaceChildren();
  for (const division of divisions) {
    const item = element('span', division); item.style.backgroundColor = colors.get(division); legend.append(item);
  }
  const result = document.getElementById('roomResults'); result.replaceChildren();
  for (const room of plan.rooms) {
    const seats = plan.seats.filter(s => String(s.room_id) === String(room.room_id));
    const section = element('section', undefined, 'room-result');
    section.append(element('h3', `Room ${room.room_number} · ${seats.length}/${room.capacity} occupied`));
    section.append(element('p', 'FRONT / BLACKBOARD', 'front-label'));
    const scroll = element('div', undefined, 'table-scroll');
    const table = element('table', undefined, 'seating-grid');
    const caption = element('caption', `Room ${room.room_number} seating grid`); caption.className = 'sr-only'; table.append(caption);
    const header = element('tr'); header.append(element('th', 'Row'));
    for (let c = 1; c <= room.columns; c++) header.append(element('th', `Column ${c}`));
    const thead = element('thead'); thead.append(header); table.append(thead);
    const body = element('tbody');
    for (let r = 1; r <= room.rows; r++) {
      const row = element('tr'); const rowHeader = element('th', String(r)); rowHeader.scope = 'row'; row.append(rowHeader);
      for (let c = 1; c <= room.columns; c++) {
        const cell = element('td'); const position = (r - 1) * room.columns + c;
        const student = seats.find(s => s.row === r && s.column === c);
        if (student) {
          cell.style.backgroundColor = colors.get(student.division);
          cell.append(element('strong', student.division), element('span', `Roll ${student.roll_no}`), element('small', `ID ${student.student_id}`));
          cell.title = `${student.name} · Seat ${student.seat_number}`;
        } else cell.append(element('span', position > room.capacity ? 'Unavailable' : 'Empty', 'empty-seat'));
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body); scroll.append(table); section.append(scroll);
    const details = element('details', undefined, 'roster');
    details.append(element('summary', 'Student allocation list'));
    const list = element('table'); const listHead = element('tr');
    for (const title of ['Seat', 'Student ID', 'Name', 'Division', 'Roll']) listHead.append(element('th', title));
    const head = element('thead'); head.append(listHead); list.append(head);
    const rows = element('tbody');
    for (const student of [...seats].sort((a, b) => a.seat_number - b.seat_number)) {
      const tr = element('tr'); for (const text of [student.seat_number, student.student_id, student.name, student.division, student.roll_no]) tr.append(element('td', String(text))); rows.append(tr);
    }
    list.append(rows); details.append(list); section.append(details); result.append(section);
  }
  document.getElementById('results').style.display = 'block';
}

document.getElementById('demoButton').addEventListener('click', () => {
  document.getElementById('examName').value = 'Semester V Examination';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('examDate').value = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  document.getElementById('examTime').value = '10:00';
  [...form.querySelectorAll('[name="division"]')].forEach(n => { n.checked = true; });
  [...form.querySelectorAll('[name="room"]')].forEach((n, i) => { n.checked = i < 3; });
  form.querySelector('[value="shuffled"]').checked = true;
  updateSelection();
  clearResults(); message('Demo inputs loaded. Click Generate Seating Arrangement.');
});

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
document.getElementById('csvButton').addEventListener('click', () => {
  if (!currentPlan) return;
  const keys = ['room_id', 'seat_number', 'row', 'column', 'student_id', 'name', 'division', 'roll_no'];
  const metadata = ['exam_name', 'exam_date', 'exam_time'];
  const rows = [[...metadata, ...keys].map(csvCell).join(',')];
  for (const seat of currentPlan.seats) rows.push([currentPlan.exam.examName, currentPlan.exam.examDate, currentPlan.exam.examTime, ...keys.map(k => seat[k])].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const link = element('a'); link.href = url; link.download = 'seating-arrangement.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.getElementById('pdfButton').addEventListener('click', () => { if (currentPlan) window.print(); });

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
document.getElementById('studentCsv').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 1000000) throw new Error('Use a CSV smaller than 1 MB.');
    const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
    const headers = rows.shift() || [];
    const required = ['student_id', 'name', 'roll_no', 'division'];
    if (!required.every(k => headers.includes(k))) throw new Error('CSV needs student_id,name,roll_no,division columns.');
    const students = rows.map(row => Object.fromEntries(required.map(key => [key, row[headers.indexOf(key)]])));
    const rolls = new Set();
    for (const student of students) {
      if (!/^\d+$/.test(student.roll_no) || Number(student.roll_no) < 1) throw new Error('Each roll number must be a positive integer.');
      const key = `${student.division}:${student.roll_no}`;
      if (rolls.has(key)) throw new Error('Roll numbers must be unique within each division.');
      rolls.add(key);
    }
    if (!students.length || students.length > 600 || students.some(s => required.some(k => !s[k])) || new Set(students.map(s => s.student_id)).size !== students.length) throw new Error('Use 1–600 complete records with unique student IDs.');
    catalog = { ...catalog, students, source: 'Imported CSV' }; imported = true;
    showCatalog(); message(`Imported ${students.length} students. Select divisions and rooms again.`);
  } catch (error) { message(error.message, true); }
  event.target.value = '';
});
document.getElementById('resetData').addEventListener('click', async () => { message(''); await loadCatalog(); });
loadCatalog();
