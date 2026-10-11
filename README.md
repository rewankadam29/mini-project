# Exam Seating Arrangement Generator

Phase 3 implementation for Mini Project PR1, Semester V, SPIT.

Team: Rewan Kadam (2024300099), Anish Kumar Karlupia (2024300107), Keshav Raina (2024300188).
Guide: Prof. Govind Gaundalkar.

## Run immediately

Extract this ZIP first. The app opens with an admin login. Run the Node demo below and open http://localhost:3000. Demo username: `admin`. Demo password: `Admin@123`. Opening HTML directly displays the login page with instructions to start the server.

For a working backend demo, install Node.js 20.12 or newer (Node.js 22 or 24 LTS recommended), open a terminal in this project folder and run:

```powershell
npm run demo
```

Open http://localhost:3000. This command uses the built-in Node HTTP server, executes the shared backend service and stores the latest 100 plans in server memory. It needs no `npm install`. Restarting the server clears these plans. Press Ctrl+C to stop.

## Express backend

```powershell
npm install
Copy-Item .env.example .env
npm start
```

`.env.example` defaults to `DATA_SOURCE=demo`. Express runs the same service as the zero-install server. To use MySQL, follow the next section and set `DATA_SOURCE=mysql` in `.env`. There is no silent fallback from MySQL to server sample data.

## MySQL setup

Use MySQL 8.0.16 or newer. In MySQL Workbench, open and execute `database/schema.sql`, then `database/seed.sql`. These scripts create the database, tables and 80 synthetic students across four divisions. Seed inserts ignore existing unique records. Do not run them against a database with unrelated data.

Copy `.env.example` to `.env`, set the real DB host, port, username and password, and set `DATA_SOURCE=mysql`. Run `npm start`. The page should say **MySQL database · backend allocation**. Generate a plan and verify:

```sql
USE exam_seating;
SELECT plan_id, exam_name, strategy, created_at FROM seating_plan ORDER BY plan_id DESC;
SELECT plan_id, COUNT(*) AS allocated_students FROM seating GROUP BY plan_id;
```

`seating_plan` stores the exam metadata and a snapshot for each generation. It extends the four-table Phase 2 design so multiple arrangements can coexist. There is no separate `EXAM` table. `seating` stores the normalized student-to-seat mapping. Both inserts run in one transaction. Unique constraints prevent duplicate students or seats within a plan.

Live MySQL persistence and the installed Express adapter have not been executed in the preparation environment. They need a local integration check before being presented as verified. The shared service, allocator and zero-install HTTP adapter are covered by the included tests.

## Modules

| Module | Files | Responsibility |
| --- | --- | --- |
| Frontend | public/index.html, style.css, script.js | Inputs, validation messages, seating grids, CSV import/export, printing |
| Graph and allocation | public/js/allocator.js | Seat/column graph, division queues, bounded backtracking, independent output validation |
| Backend service | backend/service.js | Request checks, catalog selection, generation and save orchestration |
| Storage | backend/repository.js | Demo memory store or MySQL reads and transactional writes |
| Server adapters | backend/server.js, demo-server.js | Express adapter or zero-install HTTP adapter |
| Database | database/schema.sql, seed.sql | Schema, relational constraints and synthetic seed data |
| Verification | tests/allocator.test.js, api.test.js | Allocation oracle, constraints, errors, persistence and HTTP checks |

## Seating rules

**Fully shuffled:** each usable seat is a vertex. Edges connect immediate horizontal and vertical neighbours in the same room. A division is a color. Adjacent occupied seats cannot have the same color. Diagonals do not count. Student assignment within each division follows roll-number order. “Shuffled” refers to division distribution, not random ordering.

**Column based:** each usable column is a vertex with capacity equal to its usable seats. Edges connect immediate neighbouring columns in the same room. Each occupied column contains one division, filled top to bottom. Adjacent occupied columns must differ. The same division can repeat vertically within its column.

The solver tries eligible divisions with the greatest remaining count first. It backtracks if that choice cannot complete the plan. Empty seats or columns may separate repeated divisions. It tries partial column fills where necessary. It validates all students and conflicts before saving anything.

Raw capacity is necessary but does not prove that a seating arrangement exists. An infeasible arrangement returns `CONSTRAINT_CONFLICT`. Reaching the time or state budget returns `SEARCH_LIMIT`, which does **not** prove infeasibility. The prototype supports at most 600 physical seats per request and bounds search to 200,000 states or approximately two seconds. Hard cases may require more rooms or different divisions.

Graph building is O(V+E). Search can be exponential in the number of vertices. Counts-aware pruning reduces many searches, but the implementation does not guarantee the minimum number of rooms or a globally optimal arrangement.

## CSV and PDF

Use `database/students-sample.csv` as the import format: `student_id,name,roll_no,division`. IDs must be unique and roll numbers must be positive and unique within a division. CSV imports run in browser memory and do not write into MySQL. Rooms still come from the current catalog. Download CSV exports the generated plan with exam metadata. **Print / Save PDF** opens the browser print dialog. Choose **Save as PDF**, landscape and background graphics for colored seats.

## API

| Method | Route | Result |
| --- | --- | --- |
| GET | /api/catalog | Students, rooms and data source |
| POST | /api/arrangements | Generate and save a complete validated plan |
| GET | /api/arrangements/:id | Retrieve a saved plan |

POST example:

```json
{"examName":"CNS","examDate":"2026-10-12","examTime":"10:00","divisions":["CE-A","CE-B","IT-A","EXTC-A"],"rooms":["101","102","103"],"seatingType":"shuffled"}
```

This is an administrator prototype for local evaluation. It binds to localhost. Admin login uses server-verified credentials, an expiring HttpOnly cookie and server-side sessions. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env to change the default demo account. Sessions clear when the server restarts. More detailed roles remain future work. Do not use real private student data on a public server without adding access control.

## Verify

```powershell
npm test
```

The 25 tests include both modes, exact capacity errors, infeasibility, blank separators, partially unavailable seats, duplicate IDs, search-limit handling, corrupted plans, API validation, failed storage and a live HTTP adapter. An independent exhaustive oracle checks all two-division count combinations on a 2×3 room.

## Git and evaluation

The ZIP includes a local Git repository and actual commits created during this preparation session under the author `Codex`. It does not claim earlier team work. Feature branches contain implementation changes and merge commits. It is not linked to GitHub yet. Use `docs/GIT_WORKFLOW.md` to inspect it and connect your own repository. Review the generated code as a team and follow your college's assistance disclosure rules.

See `docs/PHASE3_DEMO.md` for the presentation sequence and viva answers.

## Admin selection update

Use Select All Classes or Select All Rooms to select the complete catalog, including options hidden by search. Use Select Shown to add only visible matches without clearing previous selections. Search classes by name and filter by department. Clear All resets the entire selection. Counts show selected classes, selected rooms, students and available seats. A partially selected catalog shows an indeterminate Select All checkbox. Logout invalidates the server session.


## Testing

The project includes automated tests for:
- Admin authentication
- Class and classroom selection
- Seating allocation strategies
- Seating arrangement validation
- Backend API operations

Run the tests using:

npm test
