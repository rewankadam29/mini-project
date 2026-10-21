(function (root) {
  class AllocationError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  function validateData(students, rooms, strategy) {
    if (!['shuffled', 'column'].includes(strategy)) throw new AllocationError('INVALID_INPUT', 'Choose a valid seating strategy.');
    if (!Array.isArray(students) || !students.length) throw new AllocationError('INVALID_INPUT', 'No students belong to the selected divisions.');
    if (!Array.isArray(rooms) || !rooms.length) throw new AllocationError('INVALID_INPUT', 'Select at least one room.');
    const ids = new Set();
    for (const student of students) {
      if (!student.student_id || !student.division || !student.name || !student.roll_no) throw new AllocationError('INVALID_INPUT', 'Every student needs an ID, name, roll number and division.');
      if (ids.has(String(student.student_id))) throw new AllocationError('INVALID_INPUT', 'Student IDs must be unique.');
      ids.add(String(student.student_id));
    }
    const roomIds = new Set();
    for (const room of rooms) {
      if (!room.room_id || roomIds.has(String(room.room_id))) throw new AllocationError('INVALID_INPUT', 'Room IDs must be unique.');
      roomIds.add(String(room.room_id));
      if (![room.rows, room.columns, room.capacity].every(Number.isSafeInteger) || room.rows < 1 || room.columns < 1 || room.capacity < 1 || room.capacity > room.rows * room.columns) {
        throw new AllocationError('INVALID_INPUT', 'Room dimensions and capacity must be positive integers. Capacity cannot exceed rows × columns.');
      }
    }
    if (rooms.reduce((sum, room) => sum + room.rows * room.columns, 0) > 600) throw new AllocationError('INVALID_INPUT', 'The allocator supports at most 600 physical seats per request.');
    const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
    if (students.length > capacity) throw new AllocationError('INSUFFICIENT_SEATS', `Insufficient Seats: ${students.length} students need seats, but selected rooms provide ${capacity}.`);
  }

  function buildGraph(rooms, strategy) {
    const vertices = [];
    for (const room of rooms) {
      const indices = new Map();
      for (let r = 0; r < room.rows; r++) {
        for (let c = 0; c < room.columns; c++) {
          if (r * room.columns + c >= room.capacity) continue;
          const key = strategy === 'column' ? c : `${r}:${c}`;
          if (!indices.has(key)) {
            indices.set(key, vertices.length);
            vertices.push({ room_id: String(room.room_id), cells: [], neighbours: [] });
          }
          vertices[indices.get(key)].cells.push({ row: r + 1, column: c + 1, seat_number: r * room.columns + c + 1 });
        }
      }
      for (const [key, index] of indices) {
        const vertex = vertices[index];
        const cell = vertex.cells[0];
        const neighbourKeys = strategy === 'column'
          ? [key - 1, key + 1]
          : [`${cell.row - 2}:${cell.column - 1}`, `${cell.row}:${cell.column - 1}`, `${cell.row - 1}:${cell.column - 2}`, `${cell.row - 1}:${cell.column}`];
        vertex.neighbours = neighbourKeys.filter(k => indices.has(k)).map(k => indices.get(k));
      }
    }
    return vertices;
  }

  function validatePlan(plan, students, rooms, strategy) {
    const errors = [];
    const allowed = new Map(students.map(s => [String(s.student_id), s]));
    const roomMap = new Map(rooms.map(r => [String(r.room_id), r]));
    const seatedIds = new Set();
    const positions = new Map();
    for (const seat of plan.seats) {
      const room = roomMap.get(String(seat.room_id));
      const source = allowed.get(String(seat.student_id));
      if (!room || !source || source.division !== seat.division) { errors.push('Invalid student or room mapping'); continue; }
      if (seatedIds.has(String(seat.student_id))) errors.push('Duplicate student');
      seatedIds.add(String(seat.student_id));
      if (!Number.isInteger(seat.row) || !Number.isInteger(seat.column) || seat.row < 1 || seat.row > room.rows || seat.column < 1 || seat.column > room.columns || seat.seat_number !== (seat.row - 1) * room.columns + seat.column || seat.seat_number > room.capacity) errors.push('Invalid seat position');
      const key = `${seat.room_id}:${seat.row}:${seat.column}`;
      if (positions.has(key)) errors.push('Duplicate seat');
      positions.set(key, seat);
    }
    if (seatedIds.size !== students.length || plan.seats.length !== students.length) errors.push('Some students are missing');
    const columnColors = new Map();
    for (const seat of plan.seats) {
      const right = positions.get(`${seat.room_id}:${seat.row}:${seat.column + 1}`);
      const below = positions.get(`${seat.room_id}:${seat.row + 1}:${seat.column}`);
      if (right && right.division === seat.division) errors.push('Horizontal conflict');
      if (strategy === 'shuffled' && below && below.division === seat.division) errors.push('Vertical conflict');
      if (strategy === 'column') {
        const key = `${seat.room_id}:${seat.column}`;
        if (columnColors.has(key) && columnColors.get(key) !== seat.division) errors.push('Mixed divisions in one column');
        columnColors.set(key, seat.division);
      }
    }
    if (strategy === 'column') {
      for (const room of rooms) for (let c = 1; c < room.columns; c++) {
        const a = columnColors.get(`${room.room_id}:${c}`);
        const b = columnColors.get(`${room.room_id}:${c + 1}`);
        if (a && b && a === b) errors.push('Adjacent column conflict');
      }
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)], studentsSeated: seatedIds.size, conflicts: errors.filter(e => e.includes('conflict')).length };
  }

  function allocate(students, rooms, strategy, options = {}) {
    validateData(students, rooms, strategy);
    const started = Date.now();
    const graph = buildGraph(rooms, strategy);
    const groups = new Map();
    for (const student of students) {
      if (!groups.has(student.division)) groups.set(student.division, []);
      groups.get(student.division).push(student);
    }
    for (const queue of groups.values()) queue.sort((a, b) => Number(a.roll_no) - Number(b.roll_no) || String(a.student_id).localeCompare(String(b.student_id)));
    const divisions = [...groups.keys()].sort();
    const remaining = divisions.map(d => groups.get(d).length);
    const colors = Array(graph.length).fill(-1);
    const amounts = Array(graph.length).fill(0);
    const suffix = Array(graph.length + 1).fill(0);
    for (let i = graph.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + graph[i].cells.length;
    let states = 0;
    let backtracks = 0;
    const maxStates = options.maxStates ?? 200000;
    const timeoutMs = options.timeoutMs ?? 2000;

    function search(index, left) {
      if (++states > maxStates || Date.now() - started > timeoutMs) throw new AllocationError('SEARCH_LIMIT', 'The search limit was reached. Try more rooms or more divisions. No incomplete plan has been saved.');
      if (left === 0) return true;
      if (index === graph.length || suffix[index] < left) return false;
      // A division cannot use a vertex adjacent to its already assigned color.
      for (let d = 0; d < remaining.length; d++) {
        if (!remaining[d]) continue;
        let upper = 0;
        for (let v = index; v < graph.length; v++) {
          if (!graph[v].neighbours.some(n => colors[n] === d)) upper += graph[v].cells.length;
        }
        if (upper < remaining[d]) return false;
      }
      const blocked = new Set(graph[index].neighbours.map(n => colors[n]));
      const choices = remaining.map((count, d) => ({ count, d })).filter(x => x.count > 0 && !blocked.has(x.d)).sort((a, b) => b.count - a.count || a.d - b.d);
      for (const { d } of choices) {
        const maximum = Math.min(graph[index].cells.length, remaining[d]);
        // In column mode, shorter fills may leave room for a later valid column.
        for (let take = maximum; take >= 1; take--) {
          colors[index] = d;
          amounts[index] = take;
          remaining[d] -= take;
          if (search(index + 1, left - take)) return true;
          remaining[d] += take;
          colors[index] = -1;
          amounts[index] = 0;
          backtracks++;
        }
      }
      // An empty seat or column can separate students of the same division.
      if (suffix[index + 1] >= left && search(index + 1, left)) return true;
      return false;
    }

    if (!search(0, students.length)) throw new AllocationError('CONSTRAINT_CONFLICT', 'Room capacity is sufficient, but these divisions cannot fit under the selected adjacency rule. Add rooms or choose another strategy.');
    const offsets = divisions.map(() => 0);
    const seats = [];
    for (let i = 0; i < graph.length; i++) {
      if (colors[i] < 0) continue;
      const d = colors[i];
      for (let j = 0; j < amounts[i]; j++) {
        const student = groups.get(divisions[d])[offsets[d]++];
        seats.push({ ...student, room_id: graph[i].room_id, ...graph[i].cells[j] });
      }
    }
    const plan = { seats, rooms, strategy, stats: { students: students.length, capacity: suffix[0], emptySeats: suffix[0] - students.length, vertices: graph.length, edges: graph.reduce((sum, v) => sum + v.neighbours.length, 0) / 2, states, backtracks, elapsedMs: Date.now() - started } };
    plan.validation = validatePlan(plan, students, rooms, strategy);
    if (!plan.validation.valid) throw new AllocationError('INTERNAL_ERROR', 'The generated plan failed validation. No plan has been saved.');
    return plan;
  }
  const api = { allocate, buildGraph, validatePlan, AllocationError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeatingAllocator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
