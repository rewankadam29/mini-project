const test = require('node:test');
const assert = require('node:assert/strict');

const {
  allocate,
  buildGraph,
  validatePlan
} = require('../public/js/allocator');

const demo = require('../public/js/demo-data');

const demoStudents = demo.students.filter(student =>
  ['CE-A', 'CE-B', 'IT-A', 'EXTC-A'].includes(student.division)
);

const students = counts =>
  counts.flatMap((count, division) =>
    Array.from({ length: count }, (_, i) => ({
      student_id: `${division}-${i}`,
      name: `Student ${i}`,
      roll_no: i + 1,
      division: `D${division}`
    }))
  );

const room = (rows, columns, capacity = rows * columns) => ({
  room_id: 'R',
  room_number: 'R',
  rows,
  columns,
  capacity
});

for (const strategy of ['shuffled', 'column']) {
  test(`${strategy}: 80 students in 90 seats`, () => {
    const plan = allocate(
      demoStudents,
      demo.rooms.slice(0, 3),
      strategy
    );

    assert.equal(plan.seats.length, 80);
    assert.equal(plan.validation.valid, true);
    assert.equal(
      new Set(plan.seats.map(student => student.student_id)).size,
      80
    );
    assert.equal(plan.stats.emptySeats, 10);
  });

  test(`${strategy}: insufficient capacity`, () => {
    assert.throws(
      () => allocate(
        demoStudents,
        demo.rooms.slice(0, 2),
        strategy
      ),
      error => error.code === 'INSUFFICIENT_SEATS'
    );
  });

  test(`${strategy}: sufficient capacity can be infeasible`, () => {
    assert.throws(
      () => allocate(
        students([strategy === 'column' ? 5 : 4]),
        [room(2, 3)],
        strategy
      ),
      error => error.code === 'CONSTRAINT_CONFLICT'
    );
  });

  test(`${strategy}: empty separators support one division`, () => {
    const plan = allocate(students([3]), [room(2, 3)], strategy);
    assert.equal(plan.validation.valid, true);
    assert.equal(plan.seats.length, 3);
  });

  test(`${strategy}: unavailable seats remain unused`, () => {
    const plan = allocate(
      students([2, 1]),
      [room(2, 3, 4)],
      strategy
    );

    assert.equal(plan.validation.valid, true);
    assert.ok(plan.seats.every(seat => seat.seat_number <= 4));
  });
}

test('seat and column graphs match a 2 by 3 room', () => {
  const seats = buildGraph([room(2, 3)], 'shuffled');
  const columns = buildGraph([room(2, 3)], 'column');

  assert.equal(seats.length, 6);
  assert.equal(
    seats.reduce((sum, vertex) => sum + vertex.neighbours.length, 0) / 2,
    7
  );

  assert.equal(columns.length, 3);
  assert.equal(
    columns.reduce(
      (sum, vertex) => sum + vertex.neighbours.length,
      0
    ) / 2,
    2
  );
});

test('duplicate IDs and invalid capacities are rejected', () => {
  const duplicate = students([2]);
  duplicate[1].student_id = duplicate[0].student_id;

  assert.throws(
    () => allocate(duplicate, [room(2, 3)], 'shuffled'),
    error => error.code === 'INVALID_INPUT'
  );

  assert.throws(
    () => allocate(students([1]), [room(2, 3, 7)], 'shuffled'),
    error => error.code === 'INVALID_INPUT'
  );
});

test('search limit differs from infeasibility', () => {
  assert.throws(
    () => allocate(
      students([2, 2]),
      [room(2, 3)],
      'shuffled',
      { maxStates: 1 }
    ),
    error => error.code === 'SEARCH_LIMIT'
  );
});

test('validator detects corrupted allocation', () => {
  const input = students([3, 3]);
  const rooms = [room(2, 3)];
  const plan = allocate(input, rooms, 'shuffled');

  plan.seats[1] = { ...plan.seats[0] };

  assert.equal(
    validatePlan(plan, input, rooms, 'shuffled').valid,
    false
  );
});

function possibleCounts(strategy) {
  const possible = new Set();

  for (let mask = 0; mask < 3 ** 6; mask++) {
    let value = mask;
    const cells = [];
    const counts = [0, 0];

    for (let i = 0; i < 6; i++) {
      const label = value % 3 - 1;
      cells.push(label);
      value = Math.floor(value / 3);
      if (label >= 0) counts[label]++;
    }

    let valid = true;

    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) {
        const label = cells[row * 3 + column];
        if (label < 0) continue;

        if (
          column < 2 &&
          cells[row * 3 + column + 1] === label
        ) {
          valid = false;
        }

        if (
          strategy === 'shuffled' &&
          row === 0 &&
          cells[3 + column] === label
        ) {
          valid = false;
        }
      }
    }

    if (strategy === 'column') {
      const columns = [];

      for (let column = 0; column < 3; column++) {
        const labels = new Set(
          [cells[column], cells[column + 3]]
            .filter(label => label >= 0)
        );

        if (labels.size > 1) valid = false;
        columns.push([...labels][0] ?? -1);
      }

      if (
        (columns[0] >= 0 && columns[0] === columns[1]) ||
        (columns[1] >= 0 && columns[1] === columns[2])
      ) {
        valid = false;
      }
    }

    if (valid) possible.add(counts.join(','));
  }

  return possible;
}

for (const strategy of ['shuffled', 'column']) {
  test(`${strategy}: agrees with exhaustive small-grid oracle`, () => {
    const possible = possibleCounts(strategy);

    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6 - a; b++) {
        if (a + b === 0) continue;

        const expected = possible.has(`${a},${b}`);
        let result = false;

        try {
          result = allocate(
            students([a, b]),
            [room(2, 3)],
            strategy
          ).validation.valid;
        } catch (error) {
          assert.equal(error.code, 'CONSTRAINT_CONFLICT');
        }

        assert.equal(result, expected);
      }
    }
  });
}