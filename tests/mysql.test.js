const fs = require('node:fs');
const path = require('node:path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const test = require('node:test');
const assert = require('node:assert/strict');
const { MySQLRepository } = require('../backend/repository');
const { createService } = require('../backend/service');

// Explicit opt-in. Uses only uniquely prefixed records and cleans those records.
test('live MySQL: records, transaction integrity, both strategies, reconnect persistence', {skip: !process.env.TEST_DB_NAME && 'Set TEST_DB_NAME to a dedicated schema imported from schema.sql.'}, async()=>{
  const config={database:process.env.TEST_DB_NAME};
  assert.notEqual(config.database, process.env.DB_NAME || 'exam_seating','Use a separate test database');
  let repo=new MySQLRepository(config);
  const prefix='test_'+Date.now()+'_';
  const students=Array.from({length:4},(_,i)=>({student_id:prefix+i,name:i===0?"Robert'); DROP TABLE student;--":'Test Student',division:prefix+(i%2),roll_no:Math.floor(i/2)+1}));
  const room={room_id:prefix+'R',room_number:prefix+'R',rows:2,columns:2,capacity:4};
  const ids=[];
  try {
    await repo.ping();
    await repo.addStudents(students);await repo.addRoom(room);
    await assert.rejects(repo.addStudents([{...students[0],student_id:prefix+'rollback',roll_no:99},students[0]]));
    const [rollback]=await repo.pool.execute('SELECT student_id FROM student WHERE student_id = ?', [prefix+'rollback']);
    assert.equal(rollback.length,0);
    for(const seatingType of ['shuffled','column']){
      const result=await createService(repo)('POST','/api/arrangements',{examName:'Integration',examDate:'2026-10-21',examTime:'10:00',divisions:[prefix+'0',prefix+'1'],rooms:[room.room_id],seatingType});
      assert.equal(result.status,201);ids.push(result.body.planId);
      assert.equal(result.body.validation.valid,true);
      await assert.rejects(repo.pool.execute('INSERT INTO seating (plan_id,student_id,room_id,seat_number,row_number,column_number) VALUES (?,?,?,?,?,?)',[result.body.planId,students[0].student_id,room.room_id,1,1,1]));
      await repo.close();repo=new MySQLRepository(config);
      assert.deepEqual(await repo.find(result.body.planId),Object.fromEntries(Object.entries(result.body).filter(([k])=>k!=='planId')));

    }
  } finally {
    for(const id of ids) await repo.pool.execute('DELETE FROM seating_plan WHERE plan_id = ?', [id]);
    for(const s of students) await repo.pool.execute('DELETE FROM student WHERE student_id = ?', [s.student_id]);
    await repo.pool.execute('DELETE FROM student WHERE student_id = ?', [prefix+'rollback']);
    await repo.pool.execute('DELETE FROM room WHERE room_id = ?', [room.room_id]);
    for(const d of [prefix+'0',prefix+'1']) await repo.pool.execute('DELETE FROM division WHERE division_name = ?', [d]);
    await repo.close();
  }
});
