const form = document.getElementById('seatingForm');

let catalog;
let serverMode = false;
let imported = false;
let currentPlan = null;
let selectingRooms = false;

const palette = [
  '#e3edff',
  '#ffe8d4',
  '#def3e7',
  '#f1e3fb',
  '#fff5cc',
  '#ddf4f7'
];

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

  const counts = new Map();

  for (const student of students) {
    counts.set(
      student.division,
      (counts.get(student.division) || 0) + 1
    );
  }

  const largestDivision = Math.max(...counts.values());
  selectingRooms = true;

  const controls = [
    ...document.querySelectorAll(
      '#seatingForm input, #seatingForm select, ' +
      '#seatingForm button, #demoButton, #studentCsv, #resetData'
    )
  ];

  const previousStates = controls.map(control => control.disabled);

  controls.forEach(control => {
    control.disabled = true;
  });

  const button = document.getElementById('autoRoomsButton');
  button.textContent = 'Finding rooms...';

  message('Finding rooms that satisfy the selected seating rules...');

  const chosen = [];
  let capacity = 0;
  let physicalSeats = 0;
  let maxDivisionSeats = 0;
  let searchLimit = false;
  let found = false;

  try {
    for (const room of pool) {
      if (physicalSeats + room.rows * room.columns > 600) continue;

      chosen.push(room);
      capacity += room.capacity;
      physicalSeats += room.rows * room.columns;
      maxDivisionSeats += divisionCapacity(room, strategy);

      if (
        capacity < students.length ||
        maxDivisionSeats < largestDivision
      ) {
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        SeatingAllocator.allocate(students, chosen, strategy, {
          maxStates: 50000,
          timeoutMs: 300
        });

        const ids = new Set(
          chosen.map(selectedRoom => String(selectedRoom.room_id))
        );

        for (const input of form.querySelectorAll('[name="room"]')) {
          input.checked = ids.has(input.value);
        }

        clearResults();
        updateSelection();
        found = true;

        message(
          `Selected ${chosen.length} rooms with ${capacity} seats. ` +
          'Seating rules checked. Click Generate Seating Arrangement.'
        );

        break;
      } catch (error) {
        if (error.code === 'SEARCH_LIMIT') {
          searchLimit = true;
        } else if (error.code !== 'CONSTRAINT_CONFLICT') {
          throw error;
        }
      }
    }

    if (!found) {
      message(
        searchLimit
          ? 'Automatic checking reached its limit. Select more rooms manually or try another seating type.'
          : 'No valid room set was found in these filters. Try All floors or select more rooms manually.',
        true
      );
    }
  } catch (error) {
    message(error.message, true);
  } finally {
    controls.forEach((control, i) => {
      control.disabled = previousStates[i];
    });

    button.textContent = 'Auto Select Rooms';
    selectingRooms = false;
  }
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

  document.getElementById('dataSource').textContent = imported
    ? 'Imported CSV · browser allocation'
    : `${catalog.source} · ${serverMode ? 'backend allocation' : 'browser allocation'}`;

  document.getElementById('dataDetails').textContent =
    `${catalog.students.length} students, ${catalog.rooms.length} rooms. ` +
    (
      catalog.source === 'Sample data'
        ? 'Synthetic records for demonstration.'
        : imported
          ? 'Imported records are not saved to MySQL.'
          : 'Student and room records loaded from MySQL.'
    );

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

      if (response.status === 401) {
        location.replace('/login.html');
        return;
      }

      if (!response.ok) throw new Error('Could not load catalog');

      catalog = await response.json();
      serverMode = true;
    } catch (error) {
      if (location.port === '3000') {
        message(
          'Backend catalog could not be loaded. Check the server and database settings. Sample data is available for a browser-only demo.',
          true
        );
      }
    }
  }

  showCatalog();
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
    let plan;

    if (serverMode && !imported) {
      const response = await fetch('/api/arrangements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      const result = await response.json();

      if (response.status === 401) {
        location.replace('/login.html');
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      plan = result;
    } else {
      await new Promise(resolve => setTimeout(resolve, 25));

      const students = catalog.students.filter(
        student => request.divisions.includes(student.division)
      );

      const rooms = catalog.rooms.filter(
        room => request.rooms.includes(String(room.room_id))
      );

      plan = SeatingAllocator.allocate(
        students,
        rooms,
        request.seatingType
      );

      plan.exam = request;
      plan.source = imported ? 'Imported CSV' : 'Sample data';
      plan.persistence = 'Browser memory only';
    }

    currentPlan = plan;
    render(plan);

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

function render(plan) {
  const date = plan.exam.examDate.split('-').reverse().join('/');

  document.getElementById('examSummary').textContent =
    `${plan.exam.examName} · ${date} · ${plan.exam.examTime} · ` +
    `${plan.strategy === 'column' ? 'Column-Based' : 'Fully Shuffled'} · ${plan.source}`;

  const stats = document.getElementById('statistics');
  stats.replaceChildren();

  const values = [
    ['Students', plan.stats.students],
    ['Capacity', plan.stats.capacity],
    ['Empty seats', plan.stats.emptySeats],
    ['Search time', `${plan.stats.elapsedMs} ms`]
  ];

  for (const [label, value] of values) {
    const item = element('div', undefined, 'stat');

    item.append(
      element('strong', String(value)),
      element('span', label)
    );

    stats.append(item);
  }

  document.getElementById('validationSummary').textContent =
    'Validation passed: each student appears once, each occupied seat is unique, and there are zero adjacency conflicts. ' +
    `Graph: ${plan.stats.vertices} vertices, ${plan.stats.edges} edges. ` +
    `Backtracks: ${plan.stats.backtracks}.`;

  const divisions = [
    ...new Set(plan.seats.map(student => student.division))
  ].sort();

  const colors = new Map(
    divisions.map((division, i) => [
      division,
      palette[i % palette.length]
    ])
  );

  const legend = document.getElementById('legend');
  legend.replaceChildren();

  for (const division of divisions) {
    const item = element('span', division);
    item.style.backgroundColor = colors.get(division);
    legend.append(item);
  }

  const result = document.getElementById('roomResults');
  result.replaceChildren();

  for (const room of plan.rooms) {
    const seats = plan.seats.filter(
      student => String(student.room_id) === String(room.room_id)
    );

    const section = element('section', undefined, 'room-result');

    section.append(
      element(
        'h3',
        `Room ${room.room_number} · ${seats.length}/${room.capacity} occupied`
      ),
      element('p', 'FRONT / BLACKBOARD', 'front-label')
    );

    const scroll = element('div', undefined, 'table-scroll');
    const table = element('table', undefined, 'seating-grid');

    const caption = element(
      'caption',
      `Room ${room.room_number} seating grid`,
      'sr-only'
    );

    table.append(caption);

    const header = element('tr');
    header.append(element('th', 'Row'));

    for (let column = 1; column <= room.columns; column++) {
      header.append(element('th', `Column ${column}`));
    }

    const thead = element('thead');
    thead.append(header);
    table.append(thead);

    const body = element('tbody');

    for (let rowNumber = 1; rowNumber <= room.rows; rowNumber++) {
      const row = element('tr');
      const rowHeader = element('th', String(rowNumber));
      rowHeader.scope = 'row';
      row.append(rowHeader);

      for (let column = 1; column <= room.columns; column++) {
        const cell = element('td');
        const position =
          (rowNumber - 1) * room.columns + column;

        const student = seats.find(
          seat => seat.row === rowNumber && seat.column === column
        );

        if (student) {
          cell.style.backgroundColor = colors.get(student.division);

          cell.append(
            element('strong', student.division),
            element('span', `Roll ${student.roll_no}`),
            element('small', `ID ${student.student_id}`)
          );

          cell.title =
            `${student.name} · Seat ${student.seat_number}`;
        } else {
          cell.append(
            element(
              'span',
              position > room.capacity ? 'Unavailable' : 'Empty',
              'empty-seat'
            )
          );
        }

        row.append(cell);
      }

      body.append(row);
    }

    table.append(body);
    scroll.append(table);
    section.append(scroll);

    const details = element('details', undefined, 'roster');
    details.append(element('summary', 'Student allocation list'));

    const list = element('table');
    const listHeader = element('tr');

    for (const title of [
      'Seat',
      'Student ID',
      'Name',
      'Division',
      'Roll'
    ]) {
      listHeader.append(element('th', title));
    }

    const listHead = element('thead');
    listHead.append(listHeader);
    list.append(listHead);

    const rows = element('tbody');

    const sortedSeats = [...seats].sort(
      (a, b) => a.seat_number - b.seat_number
    );

    for (const student of sortedSeats) {
      const row = element('tr');

      for (const value of [
        student.seat_number,
        student.student_id,
        student.name,
        student.division,
        student.roll_no
      ]) {
        row.append(element('td', String(value)));
      }

      rows.append(row);
    }

    list.append(rows);
    details.append(list);
    section.append(details);
    result.append(section);
  }

  document.getElementById('results').style.display = 'block';
}

document.getElementById('demoButton').addEventListener(
  'click',
  async () => {
    document.getElementById('examName').value =
      'Semester V Examination';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    document.getElementById('examDate').value =
      `${tomorrow.getFullYear()}-` +
      `${String(tomorrow.getMonth() + 1).padStart(2, '0')}-` +
      `${String(tomorrow.getDate()).padStart(2, '0')}`;

    document.getElementById('examTime').value = '10:00';

    for (const input of form.querySelectorAll('[name="division"]')) {
      input.checked = true;
    }

    document.getElementById('divisionSearch').value = '';
    document.getElementById('departmentFilter').value = '';
    document.getElementById('roomSearch').value = '';
    document.getElementById('floorFilter').value = '';

    form.querySelector('[value="shuffled"]').checked = true;

    filterOptions();
    updateSelection();
    clearResults();

    await autoSelectRooms();
  }
);

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

      catalog = {
        ...catalog,
        students,
        source: 'Imported CSV'
      };

      imported = true;
      showCatalog();

      message(
        `Imported ${students.length} students. Select divisions and rooms again.`
      );
    } catch (error) {
      message(error.message, true);
    }

    event.target.value = '';
  }
);

document.getElementById('resetData').addEventListener(
  'click',
  async () => {
    message('');
    await loadCatalog();
  }
);

installRoomControls();
loadCatalog();