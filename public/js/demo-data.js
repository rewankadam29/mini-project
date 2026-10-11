(function (root) {
  const departments = ['CE', 'CSE', 'IT', 'EXTC'];
  const sections = ['A', 'B', 'C', 'D', 'E'];

  const divisions = departments.flatMap(department =>
    sections.map(section => `${department}-${section}`)
  );

  const students = divisions.flatMap((division, group) =>
    Array.from({ length: 20 }, (_, i) => ({
      student_id: `${group + 1}${String(i + 1).padStart(3, '0')}`,
      name: `Sample ${division} Student ${i + 1}`,
      roll_no: i + 1,
      division
    }))
  );

  const rooms = [1, 2, 3, 4].flatMap(floor =>
    Array.from({ length: 5 }, (_, i) => {
      const number = String(floor * 100 + i + 1);

      return {
        room_id: number,
        room_number: number,
        floor,
        rows: 5,
        columns: 6,
        capacity: 30
      };
    })
  );

  const data = {
    students,
    rooms,
    source: 'Sample data'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = data;
  } else {
    root.DemoData = data;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);