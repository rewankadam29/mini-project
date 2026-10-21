const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../backend/server');
const { createService, checkStudents, checkRoom } = require('../backend/service');
const { MySQLRepository } = require('../backend/repository');
const fixture = require('./fixtures');
class TestRepository {
  constructor() { this.plans = new Map(); this.students = structuredClone(fixture.students); this.rooms = structuredClone(fixture.rooms); }
  async catalog() { return {students:this.students,rooms:this.rooms,source:'Test fixture'}; }
  async save(plan) { const id = this.plans.size+1; this.plans.set(id,structuredClone(plan)); return id; }
  async find(id) { return this.plans.get(id); }
  async history() { return [...this.plans.keys()].map(plan_id=>({plan_id})); }
  async addStudents(students) { this.students.push(...students); return students.length; }
  async addRoom(room) { this.rooms.push(room); }
}
const request = { examName:'CNS',examDate:'2026-10-21',examTime:'10:00',divisions:['CE-A','CE-B','IT-A','EXTC-A'],rooms:['101','102','103'],seatingType:'shuffled' };
test('service rejects invalid requests without saving', async()=>{
  const repo = new TestRepository(), handle=createService(repo);
  for(const change of [{examDate:'2026-02-31'},{examName:' '},{rooms:['unknown']},{rooms:['101','101']},{rooms:['101']},{divisions:[]}]) {
    assert.ok((await handle('POST','/api/arrangements',{...request,...change})).status>=400);
  }
  assert.equal(repo.plans.size,0);
});
test('record validation rejects malformed records and duplicates',()=>{
  const s={student_id:'S',name:'Name',division:'CE-A',roll_no:1};
  for(const rows of [[],[null],[{...s,roll_no:1.5}],[{...s,name:' '}],[s,s]]) assert.throws(()=>checkStudents(rows));
  for(const r of [null,{room_id:'R',room_number:'1',rows:2,columns:2,capacity:5},{room_id:'R',room_number:'1',rows:600,columns:2,capacity:600}]) assert.throws(()=>checkRoom(r));
});
test('database errors return 503 and duplicate records return 409',async()=>{
  const repo=new TestRepository(), handle=createService(repo);
  repo.catalog=async()=>{throw new Error('offline')};
  assert.equal((await handle('GET','/api/catalog')).status,503);
  repo.addStudents=async()=>{throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'})};
  assert.equal((await handle('POST','/api/students',{students:[{student_id:'X',name:'N',division:'D',roll_no:1}]})).status,409);
});
test('Express HTTP login, upload, classroom, generation, history, retrieval and logout',async()=>{
  const app=createApp(new TestRepository(),{username:'test',password:'TestPassword123'});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='';
  const call=(path,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
  try {
    assert.equal((await call('/api/catalog')).status,401);
    assert.match(await (await call('/')).text(),/loginForm/);
    const login=await call('/api/auth/login',{username:'test',password:'TestPassword123'});
    assert.equal(login.status,200); assert.match(login.headers.get('set-cookie'),/HttpOnly/);
    cookie=login.headers.get('set-cookie').split(';')[0];
    assert.match(await (await call('/index.html')).text(),/Saved arrangements/);
    assert.equal((await call('/api/students',{students:[{student_id:'NEW',name:'A Student',roll_no:1,division:'NEW'}]})).status,201);
    assert.equal((await call('/api/rooms',{room_id:'NEW',room_number:'New',rows:2,columns:3,capacity:6})).status,201);
    const catalog=await (await call('/api/catalog')).json(); assert.equal(catalog.students.length,401);
    for(const seatingType of ['shuffled','column']) {
      const start=performance.now();
      const response=await call('/api/arrangements',{...request,seatingType});
      assert.equal(response.status,201);
      const plan=await response.json(); assert.equal(plan.validation.valid,true);
      assert.deepEqual(await (await call('/api/arrangements/'+plan.planId)).json(),plan);
      console.log(seatingType+' HTTP response ms: '+(performance.now()-start).toFixed(1));
    }
    assert.equal((await (await call('/api/arrangements')).json()).length,2);
    assert.equal((await call('/api/arrangements/999')).status,404);
    assert.equal((await fetch(base+'/api/catalog',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{broken'})).status,400);
    assert.equal((await call('/backend/repository.js')).status,404);
    await call('/api/auth/logout',{});
    assert.equal((await call('/api/catalog')).status,401);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('mysql2 connection refusal is handled without fallback',async()=>{
  const net=require('node:net');
  const socket=net.createServer().listen(0,'127.0.0.1');
  await new Promise(resolve=>socket.once('listening',resolve));
  const port=socket.address().port; await new Promise(resolve=>socket.close(resolve));
  const repo=new MySQLRepository({host:'127.0.0.1',port,connectTimeout:500});
  try { assert.equal((await createService(repo)('GET','/api/catalog')).status,503); }
  finally { await repo.close(); }
});
test('student insert binds SQL payload and rolls back the whole batch on failure',async()=>{
  const repo=Object.create(MySQLRepository.prototype), calls=[];
  let rolledBack=false, released=false;
  repo.pool={getConnection:async()=>({
    beginTransaction:async()=>{},commit:async()=>assert.fail('must not commit'),
    rollback:async()=>{rolledBack=true},release:()=>{released=true},
    execute:async(sql,params)=>{calls.push({sql,params}); if(sql.startsWith('SELECT')) return [[{division_id:1}]]; if(sql.startsWith('INSERT INTO student')) throw new Error('write failed'); return [{}];}
  })};
  const payload="Robert'); DROP TABLE student;--";
  await assert.rejects(repo.addStudents([{student_id:'S',name:payload,division:'CE',roll_no:1}]));
  assert.equal(rolledBack,true);assert.equal(released,true);
  const insert=calls.find(c=>c.sql.startsWith('INSERT INTO student'));
  assert.ok(!insert.sql.includes(payload));assert.equal(insert.params[1],payload);
});
