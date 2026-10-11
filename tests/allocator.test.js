const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate, buildGraph, validatePlan } = require('../public/js/allocator');
const demo = require('../public/js/demo-data');

const students = counts => counts.flatMap((count, d) => Array.from({ length: count }, (_, i) => ({ student_id: `${d}-${i}`, name: `Student ${i}`, roll_no: i + 1, division: `D${d}` })));
const room = (rows, columns, capacity = rows * columns) => ({ room_id: 'R', room_number: 'R', rows, columns, capacity });

for (const strategy of ['shuffled', 'column']) {
  test(`${strategy}: 80 students in 90 seats, no duplicates or conflicts`, () => {
    const plan = allocate(demo.students, demo.rooms.slice(0, 3), strategy);
    assert.equal(plan.seats.length, 80); assert.equal(plan.validation.valid, true);
    assert.equal(new Set(plan.seats.map(s => s.student_id)).size, 80);
    assert.equal(plan.stats.emptySeats, 10);
  });
  test(`${strategy}: insufficient capacity rejects the whole request`, () => assert.throws(() => allocate(demo.students, demo.rooms.slice(0, 2), strategy), e => e.code === 'INSUFFICIENT_SEATS'));
  test(`${strategy}: enough capacity can still be infeasible`, () => assert.throws(() => allocate(students([strategy === 'column' ? 5 : 4]), [room(2, 3)], strategy), e => e.code === 'CONSTRAINT_CONFLICT'));
  test(`${strategy}: a single division uses empty separators`, () => {
    const plan = allocate(students([3]), [room(2, 3)], strategy);
    assert.equal(plan.validation.valid, true); assert.equal(plan.seats.length, 3);
  });
  test(`${strategy}: partially unavailable room seats stay unused`, () => {
    const plan = allocate(students([2, 1]), [room(2, 3, 4)], strategy);
    assert.equal(plan.validation.valid, true); assert.ok(plan.seats.every(s => s.seat_number <= 4));
  });
}

test('seat and column graphs match a 2 by 3 room', () => {
  const seatGraph = buildGraph([room(2, 3)], 'shuffled');
  const columnGraph = buildGraph([room(2, 3)], 'column');
  assert.equal(seatGraph.length, 6); assert.equal(seatGraph.reduce((n, v) => n + v.neighbours.length, 0) / 2, 7);
  assert.equal(columnGraph.length, 3); assert.equal(columnGraph.reduce((n, v) => n + v.neighbours.length, 0) / 2, 2);
});
test('duplicate student IDs and invalid room capacity are rejected', () => {
  const duplicate = students([2]); duplicate[1].student_id = duplicate[0].student_id;
  assert.throws(() => allocate(duplicate, [room(2, 3)], 'shuffled'), e => e.code === 'INVALID_INPUT');
  assert.throws(() => allocate(students([1]), [room(2, 3, 7)], 'shuffled'), e => e.code === 'INVALID_INPUT');
});
test('search limit differs from a proven infeasible input', () => assert.throws(() => allocate(students([2, 2]), [room(2, 3)], 'shuffled', { maxStates: 1 }), e => e.code === 'SEARCH_LIMIT'));
test('independent validator detects a duplicate or conflicting allocation', () => {
  const input = students([3, 3]); const rooms = [room(2, 3)];
  const plan = allocate(input, rooms, 'shuffled');
  plan.seats[1] = { ...plan.seats[0] };
  assert.equal(validatePlan(plan, input, rooms, 'shuffled').valid, false);
});

// Independent oracle enumerates every physical seat label on a small grid.
// It does not use the graph builder or allocation implementation.
function possibleCounts(strategy) {
  const possible = new Set();
  for (let mask = 0; mask < 3 ** 6; mask++) {
    let value = mask; const cells = []; const counts = [0, 0];
    for (let i = 0; i < 6; i++) { const label = value % 3 - 1; cells.push(label); value = Math.floor(value / 3); if (label >= 0) counts[label]++; }
    let valid = true;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const label = cells[r * 3 + c]; if (label < 0) continue;
      if (c < 2 && cells[r * 3 + c + 1] === label) valid = false;
      if (strategy === 'shuffled' && r === 0 && cells[3 + c] === label) valid = false;
    }
    if (strategy === 'column') {
      const cols = [];
      for (let c = 0; c < 3; c++) {
        const labels = new Set([cells[c], cells[c + 3]].filter(x => x >= 0));
        if (labels.size > 1) valid = false; cols.push([...labels][0] ?? -1);
      }
      if ((cols[0] >= 0 && cols[0] === cols[1]) || (cols[1] >= 0 && cols[1] === cols[2])) valid = false;
    }
    if (valid) possible.add(counts.join(','));
  }
  return possible;
}
for (const strategy of ['shuffled', 'column']) test(`${strategy}: agrees with exhaustive 2 by 3 grid oracle`, () => {
  const possible = possibleCounts(strategy);
  for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6 - a; b++) {
    if (a + b === 0) continue;
    const expected = possible.has(`${a},${b}`);
    let result = false;
    try { result = allocate(students([a, b]), [room(2, 3)], strategy).validation.valid; }
    catch (e) { assert.equal(e.code, 'CONSTRAINT_CONFLICT'); }
    assert.equal(result, expected, `counts=${a},${b}, strategy=${strategy}`);
  }
});
