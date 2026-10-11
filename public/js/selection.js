(function (root) {
  function department(division) { return division.split('-')[0]; }
  function matchesDivision(division, query, selectedDepartment) {
    return (!selectedDepartment || department(division) === selectedDepartment) && division.toLowerCase().includes(query.trim().toLowerCase());
  }
  function bulkSelection(allIds, selectedIds, action, shownIds = allIds) {
    if (action === 'clear') return new Set();
    if (action === 'all') return new Set(allIds);
    return new Set([...selectedIds, ...shownIds]);
  }
  function totals(students, rooms, divisionIds, roomIds) {
    const divisions = new Set(divisionIds); const roomSet = new Set(roomIds);
    return {
      students: students.filter(s => divisions.has(s.division)).length,
      capacity: rooms.filter(r => roomSet.has(String(r.room_id))).reduce((sum, r) => sum + r.capacity, 0)
    };
  }
  const api = { department, matchesDivision, bulkSelection, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdminSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
