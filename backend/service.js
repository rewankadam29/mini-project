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
        plan.persistence = catalog.source === 'Sample data' ? 'Saved in server memory until restart' : 'Saved to MySQL';
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
      console.error('Backend operation failed:', error.message);
      return { status: 503, body: { code: 'STORAGE_ERROR', error: 'Could not read or save database records. Check the database setup. No successful save has been confirmed.' } };
    }
  };
}
module.exports = { createService, checkRequest };
