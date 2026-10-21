# Phase 4 implementation and evaluation evidence

## Architecture and integration (P1)

The browser uses the Express server on localhost:3000. Authentication gates every data API. mysql2 connects to MySQL using .env. Student CSV uploads and classroom forms call validated APIs; the database is the sole application data source. Backend generation uses the existing graph allocator and independent plan validator. A transaction saves exam metadata/snapshot and normalized seats together. History retrieves snapshots from MySQL. Browser printing and CSV export use that same returned plan.

The shared allocator remains in public/js/allocator.js because Auto Select Rooms uses it to check candidates; final generation and persistence always run on the backend. No demo server, frontend sample-data fallback or browser-only import path remains. Tests alone own synthetic fixtures.

Admin credentials are required in .env; password checks use scrypt and timing-safe comparison. Cookies are HttpOnly/SameSite=Strict, sessions expire after eight hours, repeated bad logins are throttled, and foreign-origin writes are blocked. Sessions intentionally expire on process restart; student/room/plan data should persist. This remains a local evaluation application, not an audited public multi-user service.

## API contract

All data routes require the login cookie. Invalid input returns 400, unsatisfiable allocation returns 422, duplicate records return 409, missing plans return 404 and database failures return 503.

| Method and route | Purpose |
|---|---|
| GET /api/auth/session | Authentication status |
| POST /api/auth/login | Username/password login |
| POST /api/auth/logout | Invalidate session |
| GET /api/catalog | Real student and room records |
| POST /api/students | Atomic batch insert: {students: [{student_id,name,roll_no,division}]} |
| POST /api/rooms | Insert {room_id,room_number,rows,columns,capacity} |
| POST /api/arrangements | Generate/save {examName,examDate,examTime,divisions,rooms,seatingType} |
| GET /api/arrangements | Latest 100 plans |
| GET /api/arrangements/:id | Retrieve saved metadata, grid and roster snapshot |

## Existing database design retained

| Table | Purpose |
|---|---|
| division | Unique division name and department |
| student | Unique student ID; unique roll within division |
| room | Grid dimensions and usable capacity |
| seating_plan | Exam title/date/time, strategy and JSON snapshot |
| seating | Normalized plan/student/room/seat rows with uniqueness and foreign keys |

There was no separate exam table in the existing design. Exam information stays in seating_plan. Parameterized queries bind user values. Batch imports and plan saves commit or roll back as units. Historical snapshots preserve the displayed record values.

## Allocation algorithm

Shuffled mode creates one graph vertex per available seat and edges between horizontal/vertical neighbours. Column mode groups cells into column vertices with edges between adjacent columns. Divisions are graph colors, and remaining student counts constrain each assignment. Bounded backtracking tries larger remaining groups first, prunes branches without enough remaining capacity, and permits empty separators. Students within each division are ordered by roll number. Independent validation checks completeness, unique students/seats, positions and adjacency before saving.

Existing limits are preserved: 600 physical seats per request, 200,000 search states, two-second search budget. The search is bounded and a SEARCH_LIMIT result is not proof that no valid plan exists. There is no subject enrolment constraint beyond the original division rules.

## Testing methodology (P2)

Executed on 21 October 2026 using Node 24.19.0. Command: npm test. The built-in Node test runner covers the original exhaustive small-grid oracle, both strategies, empty/invalid input, capacity, duplicate prevention, authentication and selection helpers. Express HTTP tests exercise real routes and cookies with a test-only repository. Repository tests check bound SQL parameters and rollback behaviour. A mysql2 test attempts a refused connection and verifies the 503 path.

Performance uses reproducible balanced datasets at 20, 200 and 600 students for each strategy. These timings are measurements for this environment, not guarantees for unbalanced or difficult cases. SQL reliability and persistence with a real server are gated by TEST_DB_NAME and were not executed here.

**Automated total: 35 tests; 34 passed, 0 failed, 1 skipped.** No real MySQL server was available. Browser execution and PDF rendering were not completed: no Chromium executable was present and the browser download failed. No database or PDF verification is claimed.

## Actual test-results table

| Test ID | Test case | Expected result | Actual result | Pass/Fail | Remarks |
|---|---|---|---|---|---|
| T01 | login rejects wrong passwords, accepts credentials, and expires sessions | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T02 | login throttles incorrect attempts and blocks foreign-origin mutations | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T03 | class search combines case-insensitive text and department filtering | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T04 | select shown preserves hidden selections while select all includes every class | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T05 | selection summary totals the chosen students and rooms | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T06 | shuffled: 80 students in 90 seats | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T07 | shuffled: insufficient capacity | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T08 | shuffled: sufficient capacity can be infeasible | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T09 | shuffled: empty separators support one division | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T10 | shuffled: unavailable seats remain unused | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T11 | column: 80 students in 90 seats | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T12 | column: insufficient capacity | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T13 | column: sufficient capacity can be infeasible | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T14 | column: empty separators support one division | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T15 | column: unavailable seats remain unused | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T16 | seat and column graphs match a 2 by 3 room | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T17 | duplicate IDs and invalid capacities are rejected | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T18 | search limit differs from infeasibility | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T19 | validator detects corrupted allocation | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T20 | shuffled: agrees with exhaustive small-grid oracle | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T21 | column: agrees with exhaustive small-grid oracle | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T22 | empty datasets and more than 600 physical seats are rejected | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T23 | shuffled: performance and integrity at 20 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T24 | column: performance and integrity at 20 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T25 | shuffled: performance and integrity at 200 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T26 | column: performance and integrity at 200 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T27 | shuffled: performance and integrity at 600 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T28 | column: performance and integrity at 600 students | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T29 | service rejects invalid requests without saving | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T30 | record validation rejects malformed records and duplicates | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T31 | database errors return 503 and duplicate records return 409 | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T32 | Express HTTP login, upload, classroom, generation, history, retrieval and logout | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T33 | mysql2 connection refusal is handled without fallback | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T34 | student insert binds SQL payload and rolls back the whole batch on failure | All stated assertions hold | Assertions passed | Pass | Executed with Node test runner |
| T35 | Live MySQL records, integrity and reconnect persistence | Inserts, rollback, both strategies and saved snapshots survive reconnect | Not executed | Not executed | No MySQL Server; opt in with TEST_DB_NAME |
| M01 | npm run dev with unavailable MySQL | Clear startup error, no fallback | Printed startup failure / ECONNREFUSED and exited | Pass | Executed with unused port and temporary test login environment |
| M02 | Full browser workflow and usability | Imports/forms/history match API and database | Not executed | Not executed | Chromium unavailable; download failed |
| M03 | PDF/print visual check | A4 room pages, no clipping or blank pages; values match saved plan | Not executed | Not executed | Requires browser print preview; inspect narrow, wide and tall rooms |
| M04 | Full process restart with live MySQL | Sign in again and retrieve identical arrangement | Not executed | Not executed | Requires local MySQL; automated optional suite verifies reconnect, manual step verifies whole process restart |

## Measured performance

- shuffled 20 students: 0.3 ms
- column 20 students: 0.2 ms
- shuffled 200 students: 3.6 ms
- column 200 students: 0.7 ms
- shuffled 600 students: 20.6 ms
- column 600 students: 1.6 ms
- shuffled HTTP response ms: 11.6
- column HTTP response ms: 5.8

HTTP timings include generation and retrieval against test fixtures, not MySQL query latency. Database throughput and query reliability remain unmeasured.

## Changes and size

Removed obsolete demo server/mode, sample logins/data, sample SQL/CSV, old Phase 3 presentation and sample plan documents. Retained synthetic data exclusively as tests/fixtures.js. Reused and extended existing MySQL repository, authentication, service, allocator and frontend. Added atomic student uploads, classroom creation, plan history, required admin configuration, lockfile and optional live-MySQL tests.

The arrangement uses monochrome tables, explicit seat numbers, per-room examination headers, signature space and eight-column strips for wide grids. Uses the existing browser Print / Save PDF mechanism without extra PDF dependencies.

**31 original project files → 24 final files (7 fewer, approximately 23% reduction).** Counts exclude .git, node_modules and directories. The final count includes the lockfile, fixtures, live database tests and this document. No passwords, .env, caches or generated test output are included.

## Evaluation walkthrough

1. Follow README.md to import schema, configure private credentials and run npm run dev.
2. Sign in, add real classrooms and import actual student CSV records. Show the records in MySQL Workbench.
3. Select exam details, divisions and rooms. Explain capacity and both adjacency rules.
4. Generate a plan, show room grid and roster, and query seating_plan/seating in Workbench.
5. Try invalid input and insufficient capacity. Show that no incomplete plan is saved.
6. Restart Node, sign in, retrieve the saved plan, and compare its students/positions.
7. Print to A4 landscape PDF; inspect every page and compare its data to the on-screen plan.
8. Run npm test and then enable the dedicated MySQL suite. Record local results before claiming end-to-end completion.

Suggested report screenshots: MySQL five-table schema, real catalog records, classroom/CSV forms, selected exam inputs, each strategy's room grid, saved-plan history after restart, printed PDF, input/capacity error, automated test totals and live-MySQL results.

Explain to the examiner: one real data source; parameterized queries; atomic saves; graph colors represent divisions; validation before persistence; search limits versus infeasibility; snapshots preserve historical output; test fixtures never enter the running application.

P1 implementation is connected in code and the HTTP workflow is tested with fixtures. Final acceptance still needs live MySQL plus browser and print checks. P2 has executed functional/performance/security checks with explicit limitations above. P3 report and P4 presentation are intentionally not generated.
