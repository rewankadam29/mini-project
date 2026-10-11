(function (root) {
  const divisions = ['CE-A', 'CE-B', 'IT-A', 'EXTC-A'];
  const students = divisions.flatMap((division, group) =>
    Array.from({ length: 20 }, (_, i) => ({
      student_id: `${group + 1}${String(i + 1).padStart(3, '0')}`,
      name: `Sample ${division} Student ${i + 1}`,
      roll_no: i + 1,
      division
    }))
  );
  const rooms = ['101', '102', '103', '104'].map(room_id => ({
    room_id, room_number: room_id, rows: 5, columns: 6, capacity: 30
  }));
  const data = { students, rooms, source: 'Sample data' };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.DemoData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
