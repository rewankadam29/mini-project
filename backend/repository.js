const sample = require('../public/js/demo-data');

class DemoRepository {
  constructor() { this.plans = new Map(); this.nextId = 1; }
  async catalog() { return structuredClone(sample); }
  async save(plan) {
    const id = this.nextId++;
    this.plans.set(id, structuredClone(plan));
    if (this.plans.size > 100) this.plans.delete(this.plans.keys().next().value);
    return id;
  }
  async find(id) { return this.plans.get(Number(id)) || null; }
}

class MySQLRepository {
  constructor() {
    const mysql = require('mysql2/promise');
    this.pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'exam_seating', waitForConnections: true, connectionLimit: 5
    });
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

function createRepository(source = process.env.DATA_SOURCE || 'demo') {
  if (!['demo', 'mysql'].includes(source)) throw new Error('DATA_SOURCE must be demo or mysql.');
  return source === 'mysql' ? new MySQLRepository() : new DemoRepository();
}
module.exports = { createRepository, DemoRepository, MySQLRepository };
