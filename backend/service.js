const { allocate, AllocationError } = require('../public/js/allocator');

function checkRequest(data) {
  if (!data || typeof data.examName !== 'string' || !data.examName.trim() || data.examName.length > 150) throw new AllocationError('INVALID_INPUT', 'Enter an exam name of 1–150 characters.');
  if (typeof data.examDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.examDate) || !Number.isFinite(Date.parse(data.examDate)) || new Date(data.examDate).toISOString().slice(0, 10) !== data.examDate) throw new AllocationError('INVALID_INPUT', 'Enter a valid examination date.');
  if (typeof data.examTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.examTime)) throw new AllocationError('INVALID_INPUT', 'Enter a valid examination time.');
  for (const key of ['divisions', 'rooms']) {
    if (!Array.isArray(data[key]) || !data[key].length || data[key].some(v => typeof v !== 'string' || !v) || new Set(data[key]).size !== data[key].length) throw new AllocationError('INVALID_INPUT', `Choose unique ${key}.`);
  }
  if (!['shuffled', 'column'].includes(data.seatingType)) throw new AllocationError('INVALID_INPUT', 'Choose a valid seating strategy.');
}

function createService(repository) {
  return async function handle(method, path, data) {
    try {
      if (method === 'POST' && path === '/api/students') {
        const students = checkStudents(data?.students);
        return { status: 201, body: { created: await repository.addStudents(students) } };
      }
      if (method === 'POST' && path === '/api/rooms') {
        const room = checkRoom(data);
        await repository.addRoom(room);
        return { status: 201, body: room };
      }
      if (method === 'GET' && path === '/api/arrangements') return { status: 200, body: await repository.history() };
      if (method === 'GET' && path === '/api/catalog') return { status: 200, body: await repository.catalog() };
      if (method === 'POST' && path === '/api/arrangements') {
        checkRequest(data);
        const catalog = await repository.catalog();
        const knownDivisions = new Set(catalog.students.map(s => s.division));
        const knownRooms = new Set(catalog.rooms.map(r => String(r.room_id)));
        if (data.divisions.some(d => !knownDivisions.has(d)) || data.rooms.some(r => !knownRooms.has(r))) throw new AllocationError('INVALID_INPUT', 'A selected division or room does not exist.');
        const students = catalog.students.filter(s => data.divisions.includes(s.division));
        const rooms = catalog.rooms.filter(r => data.rooms.includes(String(r.room_id)));
        const plan = allocate(students, rooms, data.seatingType);
        plan.exam = { ...data, examName: data.examName.trim() };
        plan.source = catalog.source;
        plan.persistence = 'Saved to MySQL';
        const planId = await repository.save(plan);
        return { status: 201, body: { ...plan, planId } };
      }
      if (method === 'GET' && /^\/api\/arrangements\/\d+$/.test(path)) {
        const id = Number(path.split('/').pop());
        const plan = await repository.find(id);
        return plan ? { status: 200, body: { ...plan, planId: id } } : { status: 404, body: { error: 'Arrangement not found.' } };
      }
      return { status: 404, body: { error: 'API route not found.' } };
    } catch (error) {
      if (error instanceof AllocationError) return { status: error.code === 'INVALID_INPUT' ? 400 : 422, body: { code: error.code, error: error.message } };
      if (error.code === 'ER_DUP_ENTRY') return { status: 409, body: { error: 'Duplicate student ID, division roll number, or room. No records from this request were added.' } };
      console.error('Backend operation failed:', error.message);
      return { status: 503, body: { code: 'STORAGE_ERROR', error: 'Could not read or save database records. Check the database setup. No successful save has been confirmed.' } };
    }
  };
}
function text(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AllocationError('INVALID_INPUT', label + ' is required and must be at most ' + max + ' characters.');
  return value.trim();
}
function integer(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new AllocationError('INVALID_INPUT', label + ' must be an integer from 1 to ' + max + '.');
  return value;
}
function checkStudents(students) {
  if (!Array.isArray(students) || !students.length || students.length > 600) throw new AllocationError('INVALID_INPUT', 'Upload 1–600 students per request.');
  const ids = new Set(), rolls = new Set();
  return students.map(s => {
    const row = { student_id: text(s?.student_id,40,'Student ID'), name: text(s?.name,120,'Name'), division: text(s?.division,40,'Division'), roll_no: integer(s?.roll_no,2147483647,'Roll number') };
    const key = JSON.stringify([row.division.toLowerCase(),row.roll_no]);
    if (ids.has(row.student_id.toLowerCase()) || rolls.has(key)) throw new AllocationError('INVALID_INPUT','Duplicate student ID or roll number in upload.');
    ids.add(row.student_id.toLowerCase()); rolls.add(key); return row;
  });
}
function checkRoom(data) {
  const r = { room_id: text(data?.room_id,40,'Room ID'), room_number: text(data?.room_number,40,'Room number'), rows: integer(data?.rows,600,'Rows'), columns: integer(data?.columns,600,'Columns'), capacity: integer(data?.capacity,600,'Capacity') };
  if (r.rows * r.columns > 600 || r.capacity > r.rows * r.columns) throw new AllocationError('INVALID_INPUT','Capacity must fit the grid; maximum 600 physical seats per room and generation request.');
  return r;
}
module.exports = { createService, checkRequest, checkStudents, checkRoom };
