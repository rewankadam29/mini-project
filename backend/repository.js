class MySQLRepository {
  constructor(config = {}) {
    const mysql = require('mysql2/promise');
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'exam_seating', waitForConnections: true, connectionLimit: 5, connectTimeout: 5000, ...config
    });
  }
  async close() { await this.pool.end(); }
  async ping() { await this.pool.execute('SELECT 1'); }
  async history() {
    const [rows] = await this.pool.execute('SELECT plan_id, exam_name, DATE_FORMAT(exam_date, "%Y-%m-%d") AS exam_date, exam_time, strategy FROM seating_plan ORDER BY plan_id DESC LIMIT 100');
    return rows;
  }
  async addStudents(students) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const s of students) {
        await connection.execute('INSERT INTO division (division_name, department) VALUES (?, ?) ON DUPLICATE KEY UPDATE division_name = VALUES(division_name)', [s.division, s.division.split('-')[0]]);
        const [divisions] = await connection.execute('SELECT division_id FROM division WHERE division_name = ?', [s.division]);
        await connection.execute('INSERT INTO student (student_id, name, roll_no, division_id) VALUES (?, ?, ?, ?)', [s.student_id, s.name, s.roll_no, divisions[0].division_id]);
      }
      await connection.commit();
      return students.length;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async addRoom(room) {
    await this.pool.execute('INSERT INTO room (room_id, room_number, `rows`, `columns`, capacity) VALUES (?, ?, ?, ?, ?)', [room.room_id, room.room_number, room.rows, room.columns, room.capacity]);
  }
  async catalog() {
    const [students] = await this.pool.execute('SELECT s.student_id, s.name, s.roll_no, d.division_name AS division FROM student s JOIN division d ON d.division_id = s.division_id ORDER BY d.division_name, s.roll_no');
    const [rooms] = await this.pool.execute('SELECT room_id, room_number, `rows`, `columns`, capacity FROM room ORDER BY room_number');
    return { students, rooms, source: 'MySQL database' };
  }
  async save(plan) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute('INSERT INTO seating_plan (exam_name, exam_date, exam_time, strategy, snapshot_json) VALUES (?, ?, ?, ?, ?)', [plan.exam.examName, plan.exam.examDate, plan.exam.examTime, plan.strategy, JSON.stringify(plan)]);
      const placeholders = plan.seats.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      const values = plan.seats.flatMap(s => [result.insertId, s.student_id, s.room_id, s.seat_number, s.row, s.column]);
      await connection.execute(`INSERT INTO seating (plan_id, student_id, room_id, seat_number, row_number, column_number) VALUES ${placeholders}`, values);
      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback(); throw error;
    } finally { connection.release(); }
  }
  async find(id) {
    const [rows] = await this.pool.execute('SELECT snapshot_json FROM seating_plan WHERE plan_id = ?', [id]);
    if (!rows.length) return null;
    const snapshot = rows[0].snapshot_json;
    return typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  }
}

module.exports = { MySQLRepository };
