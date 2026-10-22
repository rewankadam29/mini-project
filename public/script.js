const form = document.getElementById('seatingForm');

let catalog;
let currentPlan = null;
let selectingRooms = false;


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

function selected(name) {
  return [
    ...form.querySelectorAll(`input[name="${name}"]:checked`)
  ].map(input => input.value);
}

function getFloor(room) {
  if (room.floor !== undefined) return String(room.floor);

  const number = Number(room.room_number);

  return Number.isInteger(number) && number >= 100
    ? String(Math.floor(number / 100))
    : 'Other';
}

function installRoomControls() {
  const options = document.getElementById('roomOptions');
  const section = options.closest('.card');

  section.querySelector('.section-heading p').textContent =
    'Select a complete floor, choose all rooms, or let Auto Select find a valid room set.';

  const search = document.getElementById('roomSearch');

  search.placeholder =
    'Room number, list (101, 202), or range (101-105)';

  const toolbar = element('div', undefined, 'selection-toolbar');
  search.parentElement.before(toolbar);
  toolbar.append(search.parentElement);

  const group = element('div', undefined, 'department-filter');
  const label = element('label', 'Floor');
  label.htmlFor = 'floorFilter';

  const filter = element('select');
  filter.id = 'floorFilter';

  group.append(label, filter);
  toolbar.append(group);

  filter.addEventListener('change', () => {
    filterOptions();
    updateSelection();
  });

  const automatic = element(
    'button',
    'Auto Select Rooms',
    'secondary compact'
  );

  automatic.type = 'button';
  automatic.id = 'autoRoomsButton';
  automatic.addEventListener('click', autoSelectRooms);

  document.getElementById('selectShownRooms').before(automatic);

  const floors = element('div', undefined, 'bulk-actions');
  floors.id = 'floorButtons';
  options.before(floors);

  const hint = element(
    'p',
    'Auto Select uses rooms shown by the floor and search filters. It replaces the previous room selection after finding a valid arrangement.',
    'note'
  );

  options.after(hint);
}

function matchesRoom(room, query, floor) {
  if (floor && getFloor(room) !== floor) return false;

  const text = query.trim().toLowerCase();
  if (!text) return true;

  const number = String(room.room_number).toLowerCase();

  return text.split(',').some(part => {
    const term = part.trim();
    if (!term) return false;

    const range = term.match(/^(\d+)\s*-\s*(\d+)$/);

    if (range) {
      return Number(number) >= Number(range[1]) &&
        Number(number) <= Number(range[2]);
    }

    return number.includes(term);
  });
}

function buildFloorControls() {
  const floors = [...new Set(catalog.rooms.map(getFloor))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  );

  const filter = document.getElementById('floorFilter');
  filter.replaceChildren();

  const all = element('option', 'All floors');
  all.value = '';
  filter.append(all);

  const buttons = document.getElementById('floorButtons');
  buttons.replaceChildren();

  for (const floor of floors) {
    const title = floor === 'Other' ? 'Other rooms' : `Floor ${floor}`;
    const option = element('option', title);
    option.value = floor;
    filter.append(option);

    const count = catalog.rooms.filter(
      room => getFloor(room) === floor
    ).length;

    const button = element(
      'button',
      `${title} (${count})`,
      'secondary compact'
    );

    button.type = 'button';
    button.dataset.floor = floor;
    button.setAttribute('aria-pressed', 'false');

    button.addEventListener('click', () => {
      const ids = new Set(
        catalog.rooms
          .filter(room => getFloor(room) === floor)
          .map(room => String(room.room_id))
      );

      const inputs = [
        ...form.querySelectorAll('[name="room"]')
      ].filter(input => ids.has(input.value));

      const allChecked = inputs.every(input => input.checked);

      for (const input of inputs) {
        input.checked = !allChecked;
      }

      clearResults();
      updateSelection();
    });

    buttons.append(button);
  }
}

function divisionCapacity(room, strategy) {
  if (strategy === 'shuffled') {
    return room.capacity === room.rows * room.columns
      ? Math.ceil(room.capacity / 2)
      : room.capacity;
  }

  let previous = 0;
  let best = 0;

  for (let column = 0; column < room.columns; column++) {
    let usable = 0;

    for (let row = 0; row < room.rows; row++) {
      if (row * room.columns + column < room.capacity) usable++;
    }

    const next = Math.max(best, previous + usable);
    previous = best;
    best = next;
  }

  return best;
}

async function autoSelectRooms() {
  if (selectingRooms || !catalog) return;

  const divisions = selected('division');

  if (!divisions.length) {
    message('Select the appearing classes first.', true);
    return;
  }

  const strategy = selected('seatingType')[0];

  if (!strategy) {
    message('Choose a seating type before Auto Select Rooms.', true);
    return;
  }

  const students = catalog.students.filter(
    student => divisions.includes(student.division)
  );

  const visibleIds = new Set(
    [...form.querySelectorAll('[name="room"]')]
      .filter(input => !input.parentElement.hidden)
      .map(input => input.value)
  );

  const pool = catalog.rooms
    .filter(room => visibleIds.has(String(room.room_id)))
    .sort(
      (a, b) =>
        b.capacity - a.capacity ||
        String(a.room_number).localeCompare(
          String(b.room_number),
          undefined,
          { numeric: true }
        )
    );

  if (!pool.length) {
    message(
      'No rooms match the filters. Choose All floors or clear the search.',
      true
    );
    return;
  }

  const totalCapacity = pool.reduce(
    (sum, room) => sum + room.capacity,
    0
  );

  if (totalCapacity < students.length) {
    message(
      'The rooms shown cannot hold all selected students. Choose All floors or widen your search.',
      true
    );
    return;
  }

  selectingRooms = true;
  const controlStates = lockControls();
  const button = document.getElementById('autoRoomsButton');
  button.textContent = 'Finding rooms...';
  message('Finding rooms that satisfy the selected seating rules...');
  try {
    const result = await findRoomSet(students, pool, strategy);
    if (!result.rooms) {
      message(
        result.searchLimit
          ? 'Automatic checking reached its limit. Select more rooms manually or try another seating type.'
          : 'No valid room set was found in these filters. Try All floors or select more rooms manually.',
        true
      );
      return;
    }
    const ids = new Set(result.rooms.map(room => String(room.room_id)));
    for (const input of form.querySelectorAll('[name="room"]')) {
      input.checked = ids.has(input.value);
    }
    clearResults();
    updateSelection();
    message(
      `Selected ${result.rooms.length} rooms with ${result.capacity} seats. ` +
      'Seating rules checked. Click Generate Seating Arrangement.'
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    restoreControls(controlStates);
    button.textContent = 'Auto Select Rooms';
    selectingRooms = false;
  }
}

function lockControls() {
  const controls = [...document.querySelectorAll(
    '#seatingForm input, #seatingForm select, #seatingForm button, ' +
    '#studentCsv, #resetData, #roomForm button'
  )];
  const states = controls.map(control => [control, control.disabled]);
  for (const control of controls) control.disabled = true;
  return states;
}

function restoreControls(states) {
  for (const [control, disabled] of states) control.disabled = disabled;
}

async function findRoomSet(students, rooms, strategy) {
  const counts = new Map();
  for (const student of students) {
    counts.set(student.division, (counts.get(student.division) || 0) + 1);
  }
  const largestDivision = Math.max(...counts.values());
  const chosen = [];
  let capacity = 0;
  let physicalSeats = 0;
  let divisionSeats = 0;
  let searchLimit = false;

  for (const room of rooms) {
    const roomSize = room.rows * room.columns;
    if (physicalSeats + roomSize > 600) continue;
    chosen.push(room);
    capacity += room.capacity;
    physicalSeats += roomSize;
    divisionSeats += divisionCapacity(room, strategy);
    if (capacity < students.length || divisionSeats < largestDivision) continue;

    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      SeatingAllocator.allocate(students, chosen, strategy, {
        maxStates: 50000,
        timeoutMs: 300
      });
      return { rooms: [...chosen], capacity, searchLimit };
    } catch (error) {
      if (error.code === 'SEARCH_LIMIT') searchLimit = true;
      else if (error.code !== 'CONSTRAINT_CONFLICT') throw error;
    }
  }
  return { rooms: null, capacity, searchLimit };
}

function showCatalog() {
  clearResults();

  const divisions = [
    ...new Set(catalog.students.map(student => student.division))
  ].sort();

  document.getElementById('divisionSearch').value = '';
  document.getElementById('roomSearch').value = '';

  buildFloorControls();

  const departmentFilter = document.getElementById('departmentFilter');
  departmentFilter.replaceChildren();

  const allOption = element('option', 'All departments');
  allOption.value = '';
  departmentFilter.append(allOption);

  const departments = [
    ...new Set(divisions.map(AdminSelection.department))
  ].sort();

  for (const department of departments) {
    const option = element('option', department);
    option.value = department;
    departmentFilter.append(option);
  }

  const divisionOptions = document.getElementById('divisionOptions');
  divisionOptions.replaceChildren();

  for (const division of divisions) {
    const label = element('label', undefined, 'option-card');
    const input = element('input');

    input.type = 'checkbox';
    input.name = 'division';
    input.value = division;

    const count = catalog.students.filter(
      student => student.division === division
    ).length;

    label.append(input, element('span', `${division} (${count})`));
    divisionOptions.append(label);
  }

  const roomOptions = document.getElementById('roomOptions');
  roomOptions.replaceChildren();

  for (const room of catalog.rooms) {
    const label = element('label', undefined, 'option-card');
    const input = element('input');

    input.type = 'checkbox';
    input.name = 'room';
    input.value = String(room.room_id);

    label.append(
      input,
      element(
        'span',
        `Room ${room.room_number} · Floor ${getFloor(room)} · ${room.capacity} seats`
      )
    );

    roomOptions.append(label);
  }

  document.getElementById('dataSource').textContent = 'MySQL database';
  document.getElementById('dataDetails').textContent = catalog.students.length + ' students, ' + catalog.rooms.length + ' rooms. Import students and add classrooms to begin.';

  filterOptions();
  updateSelection();
}

async function api(url, body) {
  const response = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (response.status === 401) { location.replace('/login.html'); throw new Error('Please sign in.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
async function loadCatalog() {
  try {
    catalog = await api('/api/catalog');
    showCatalog();
    return true;
  } catch (error) {
    catalog = { students: [], rooms: [] };
    showCatalog();
    document.getElementById('dataSource').textContent = 'Database unavailable';
    message(error.message, true);
    return false;
  }
}

function filterOptions() {
  const query = document.getElementById('divisionSearch').value;
  const department = document.getElementById('departmentFilter').value;

  for (const label of document.querySelectorAll(
    '#divisionOptions .option-card'
  )) {
    label.hidden = !AdminSelection.matchesDivision(
      label.querySelector('input').value,
      query,
      department
    );
  }

  const roomQuery = document.getElementById('roomSearch').value;
  const floor = document.getElementById('floorFilter').value;

  const rooms = new Map(
    catalog.rooms.map(room => [String(room.room_id), room])
  );

  for (const label of document.querySelectorAll(
    '#roomOptions .option-card'
  )) {
    label.hidden = !matchesRoom(
      rooms.get(label.querySelector('input').value),
      roomQuery,
      floor
    );
  }

  document.getElementById('divisionNoMatches').hidden = [
    ...document.querySelectorAll('#divisionOptions .option-card')
  ].some(label => !label.hidden);

  document.getElementById('roomNoMatches').hidden = [
    ...document.querySelectorAll('#roomOptions .option-card')
  ].some(label => !label.hidden);
}

function updateSelection() {
  const groups = [
    ['division', 'allDivisions', 'divisionCount', 'classes'],
    ['room', 'allRooms', 'roomCount', 'rooms']
  ];

  for (const [name, masterId, countId, noun] of groups) {
    const inputs = [
      ...form.querySelectorAll(`input[name="${name}"]`)
    ];

    const chosen = inputs.filter(input => input.checked);
    const hiddenChosen = chosen.filter(
      input => input.parentElement.hidden
    ).length;

    const master = document.getElementById(masterId);
    master.checked =
      inputs.length > 0 && chosen.length === inputs.length;
    master.indeterminate =
      chosen.length > 0 && chosen.length < inputs.length;

    document.getElementById(countId).textContent =
      `${chosen.length} of ${inputs.length} ${noun} selected` +
      (
        hiddenChosen
          ? ` (${hiddenChosen} outside this filter)`
          : ''
      );

    for (const input of inputs) {
      input.parentElement.classList.toggle(
        'is-selected',
        input.checked
      );
    }
  }

  if (!catalog) return;

  for (const button of document.querySelectorAll(
    '#floorButtons button'
  )) {
    const ids = new Set(
      catalog.rooms
        .filter(room => getFloor(room) === button.dataset.floor)
        .map(room => String(room.room_id))
    );

    const inputs = [
      ...form.querySelectorAll('[name="room"]')
    ].filter(input => ids.has(input.value));

    const complete =
      inputs.length > 0 && inputs.every(input => input.checked);

    button.setAttribute('aria-pressed', String(complete));
    button.style.backgroundColor = complete ? '#153e75' : '';
    button.style.color = complete ? 'white' : '';
  }

  const totals = AdminSelection.totals(
    catalog.students,
    catalog.rooms,
    selected('division'),
    selected('room')
  );

  const summary = document.getElementById('selectionSummary');
  const ready =
    selected('division').length > 0 &&
    selected('room').length > 0;

  summary.textContent = ready
    ? `${totals.students} students · ${totals.capacity} available seats · ` +
      (
        totals.capacity >= totals.students
          ? `${totals.capacity - totals.students} spare seats`
          : `${totals.students - totals.capacity} more seats needed`
      )
    : `${totals.students} students · ${totals.capacity} available seats. Choose at least one class and room.`;

  summary.classList.toggle(
    'capacity-error',
    ready && totals.students > totals.capacity
  );
}

function chooseBulk(name, action) {
  const inputs = [
    ...form.querySelectorAll(`input[name="${name}"]`)
  ];

  const chosen = AdminSelection.bulkSelection(
    inputs.map(input => input.value),
    selected(name),
    action,
    inputs
      .filter(input => !input.parentElement.hidden)
      .map(input => input.value)
  );

  for (const input of inputs) {
    input.checked = chosen.has(input.value);
  }

  clearResults();
  updateSelection();
}

document.getElementById('allDivisions').addEventListener(
  'change',
  event => chooseBulk(
    'division',
    event.target.checked ? 'all' : 'clear'
  )
);

document.getElementById('allRooms').addEventListener(
  'change',
  event => chooseBulk('room', event.target.checked ? 'all' : 'clear')
);

document.getElementById('selectShownDivisions').addEventListener(
  'click',
  () => chooseBulk('division', 'shown')
);

document.getElementById('selectShownRooms').addEventListener(
  'click',
  () => chooseBulk('room', 'shown')
);

document.getElementById('clearDivisions').addEventListener(
  'click',
  () => chooseBulk('division', 'clear')
);

document.getElementById('clearRooms').addEventListener(
  'click',
  () => chooseBulk('room', 'clear')
);

for (const id of [
  'divisionSearch',
  'departmentFilter',
  'roomSearch'
]) {
  document.getElementById(id).addEventListener('input', () => {
    filterOptions();
    updateSelection();
  });
}

form.addEventListener('change', event => {
  if ([
    'divisionSearch',
    'departmentFilter',
    'roomSearch',
    'floorFilter'
  ].includes(event.target.id)) {
    return;
  }

  clearResults();
  updateSelection();
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
    divisions: selected('division'),
    rooms: selected('room'),
    seatingType: selected('seatingType')[0]
  };

  if (
    !request.examName ||
    !request.divisions.length ||
    !request.rooms.length
  ) {
    message(
      'Enter an exam name and select at least one division and room.',
      true
    );
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Generating...';

  try {
    const plan = await api('/api/arrangements', request);
    currentPlan = plan;
    render(plan);
    await loadHistory();

    message(
      `All ${plan.stats.students} students seated. ${plan.persistence}.`
    );

    document.getElementById('results').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Generate Seating Arrangement';
  }
});

function tableHead(titles) {
  const row = element('tr');
  for (const title of titles) row.append(element('th', title));
  const head = element('thead');
  head.append(row);
  return head;
}

function seatCell(student, position, capacity) {
  const cell = element('td');
  if (!student) {
    cell.append(element(
      'span',
      position > capacity ? 'Unavailable' : 'Empty',
      'empty-seat'
    ));
    return cell;
  }
  cell.append(
    element('strong', student.division),
    element('span', `Roll ${student.roll_no}`),
    element('small', `ID ${student.student_id} · Seat ${student.seat_number}`)
  );
  cell.title = `${student.name} · Seat ${student.seat_number}`;
  return cell;
}

function seatingGrid(room, seatMap, firstColumn, lastColumn) {
  const table = element('table', undefined, 'seating-grid');
  table.append(element('caption', `Room ${room.room_number} seating grid`, 'sr-only'));
  table.append(tableHead([
    'Row',
    ...Array.from(
      { length: lastColumn - firstColumn + 1 },
      (_, i) => `Column ${firstColumn + i}`
    )
  ]));

  const body = element('tbody');
  for (let rowNumber = 1; rowNumber <= room.rows; rowNumber++) {
    const row = element('tr');
    const rowHeader = element('th', String(rowNumber));
    rowHeader.scope = 'row';
    row.append(rowHeader);
    for (let column = firstColumn; column <= lastColumn; column++) {
      const position = (rowNumber - 1) * room.columns + column;
      row.append(seatCell(
        seatMap.get(`${rowNumber}:${column}`),
        position,
        room.capacity
      ));
    }
    body.append(row);
  }
  table.append(body);

  const scroll = element('div', undefined, 'table-scroll');
  scroll.append(table);
  return scroll;
}

function roster(seats) {
  const details = element('details', undefined, 'roster');
  details.append(element('summary', 'Student allocation list'));
  const table = element('table');
  table.append(tableHead(['Seat', 'Student ID', 'Name', 'Division', 'Roll']));
  const body = element('tbody');
  for (const student of [...seats].sort((a, b) => a.seat_number - b.seat_number)) {
    const row = element('tr');
    for (const value of [student.seat_number, student.student_id, student.name, student.division, student.roll_no]) {
      row.append(element('td', String(value)));
    }
    body.append(row);
  }
  table.append(body);
  details.append(table);
  return details;
}

function roomResult(plan, room, date) {
  const seats = plan.seats.filter(seat => String(seat.room_id) === String(room.room_id));
  const seatMap = new Map(seats.map(seat => [`${seat.row}:${seat.column}`, seat]));
  const section = element('section', undefined, 'room-result');
  section.append(
    element('h3', 'Sardar Patel Institute of Technology'),
    element('h4', 'EXAMINATION SEATING ARRANGEMENT'),
    element('p', `${plan.exam.examName} | Date: ${date} | Session: ${plan.exam.examTime}`),
    element('h3', `Room ${room.room_number} · ${seats.length}/${room.capacity} occupied`),
    element('p', 'FRONT / BLACKBOARD', 'front-label')
  );
  for (let firstColumn = 1; firstColumn <= room.columns; firstColumn += 8) {
    section.append(seatingGrid(
      room,
      seatMap,
      firstColumn,
      Math.min(room.columns, firstColumn + 7)
    ));
  }
  section.append(
    roster(seats),
    element('p', 'Invigilator signature: ____________________    Date: ______________', 'signature')
  );
  return section;
}

function render(plan) {
  const date = plan.exam.examDate.split('-').reverse().join('/');
  const strategy = plan.strategy === 'column' ? 'Column-Based' : 'Fully Shuffled';
  document.getElementById('examSummary').textContent =
    `${plan.exam.examName} · ${date} · ${plan.exam.examTime} · ${strategy} · ${plan.source}`;

  const statistics = document.getElementById('statistics');
  statistics.replaceChildren();
  for (const [label, value] of [
    ['Students', plan.stats.students],
    ['Capacity', plan.stats.capacity],
    ['Empty seats', plan.stats.emptySeats],
    ['Search time', `${plan.stats.elapsedMs} ms`]
  ]) {
    const item = element('div', undefined, 'stat');
    item.append(element('strong', String(value)), element('span', label));
    statistics.append(item);
  }

  document.getElementById('validationSummary').textContent =
    'Validation passed: each student and occupied seat is unique, with zero adjacency conflicts. ' +
    `Graph: ${plan.stats.vertices} vertices, ${plan.stats.edges} edges. Backtracks: ${plan.stats.backtracks}.`;
  document.getElementById('legend').replaceChildren();
  document.getElementById('roomResults').replaceChildren(
    ...plan.rooms.map(room => roomResult(plan, room, date))
  );
  document.getElementById('results').style.display = 'block';
}

function csvCell(value) {
  let text = String(value ?? '');

  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replaceAll('"', '""')}"`;
}

document.getElementById('csvButton').addEventListener('click', () => {
  if (!currentPlan) return;

  const keys = [
    'room_id',
    'seat_number',
    'row',
    'column',
    'student_id',
    'name',
    'division',
    'roll_no'
  ];

  const metadata = ['exam_name', 'exam_date', 'exam_time'];

  const rows = [
    [...metadata, ...keys].map(csvCell).join(',')
  ];

  for (const seat of currentPlan.seats) {
    rows.push(
      [
        currentPlan.exam.examName,
        currentPlan.exam.examDate,
        currentPlan.exam.examTime,
        ...keys.map(key => seat[key])
      ].map(csvCell).join(',')
    );
  }

  const url = URL.createObjectURL(
    new Blob(
      ['\ufeff' + rows.join('\r\n')],
      { type: 'text/csv;charset=utf-8;' }
    )
  );

  const link = element('a');
  link.href = url;
  link.download = 'seating-arrangement.csv';
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById('pdfButton').addEventListener('click', () => {
  if (currentPlan) window.print();
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if (
      (character === '\n' || character === '\r') &&
      !quoted
    ) {
      if (character === '\r' && text[i + 1] === '\n') i++;

      row.push(field.trim());

      if (row.some(Boolean)) rows.push(row);

      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV has an unclosed quoted field.');

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  return rows;
}

document.getElementById('studentCsv').addEventListener(
  'change',
  async event => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.disabled = true;

    try {
      if (file.size > 1000000) {
        throw new Error('Use a CSV smaller than 1 MB.');
      }

      const rows = parseCsv(
        (await file.text()).replace(/^\uFEFF/, '')
      );

      const headers = rows.shift() || [];
      const required = [
        'student_id',
        'name',
        'roll_no',
        'division'
      ];

      if (!required.every(key => headers.includes(key))) {
        throw new Error(
          'CSV needs student_id,name,roll_no,division columns.'
        );
      }

      const students = rows.map(row =>
        Object.fromEntries(
          required.map(key => [
            key,
            row[headers.indexOf(key)]
          ])
        )
      );

      const rolls = new Set();

      for (const student of students) {
        if (
          !/^\d+$/.test(student.roll_no) ||
          Number(student.roll_no) < 1
        ) {
          throw new Error(
            'Each roll number must be a positive integer.'
          );
        }

        const key = `${student.division}:${student.roll_no}`;

        if (rolls.has(key)) {
          throw new Error(
            'Roll numbers must be unique within each division.'
          );
        }

        rolls.add(key);
      }

      if (
        !students.length ||
        students.length > 600 ||
        students.some(student =>
          required.some(key => !student[key])
        ) ||
        new Set(students.map(student => student.student_id)).size !==
          students.length
      ) {
        throw new Error(
          'Use 1–600 complete records with unique student IDs.'
        );
      }

      const saved = await api('/api/students', { students: students.map(s => ({ ...s, roll_no: Number(s.roll_no) })) });
      if (await loadCatalog()) message('Saved ' + saved.created + ' students to MySQL. Select divisions and rooms again.');
    } catch (error) {
      message(error.message, true);
    }

    event.target.value = '';
    event.target.disabled = false;
  }
);

document.getElementById('resetData').addEventListener(
  'click',
  async () => {
    message('');
    await loadCatalog();
  }
);

document.getElementById('roomForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    const room = Object.fromEntries(new FormData(event.target));
    for (const key of ['rows','columns','capacity']) room[key] = Number(room[key]);
    await api('/api/rooms', room);
    event.target.reset();
    if (await loadCatalog()) message('Classroom saved to MySQL.');
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
});
async function loadHistory() {
  const select = document.getElementById('savedPlan');
  try {
    const plans = await api('/api/arrangements');
    select.replaceChildren(element('option', 'Choose a saved arrangement'));
    select.firstChild.value = '';
    for (const plan of plans) {
      const option = element('option', '#' + plan.plan_id + ' · ' + plan.exam_name + ' · ' + plan.exam_date + ' ' + plan.exam_time);
      option.value = plan.plan_id; select.append(option);
    }
  } catch (error) { message(error.message, true); }
}
document.getElementById('refreshHistory').addEventListener('click', loadHistory);
document.getElementById('openPlan').addEventListener('click', async () => {
  const id = document.getElementById('savedPlan').value;
  if (!id) return message('Choose a saved arrangement.', true);
  try { currentPlan = await api('/api/arrangements/' + id); render(currentPlan); message('Loaded saved arrangement #' + id); }
  catch (error) { message(error.message, true); }
});
installRoomControls();
loadCatalog();
loadHistory();
