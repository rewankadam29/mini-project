# Phase 3 demonstration guide

The marksheet allocates 10 marks to module-wise coding, 5 to repository setup, 5 to branching and commit conventions, and 5 to presentation.

## Before the evaluation

1. Extract the ZIP and run the working demo once on the laptop you will use.
2. Read `public/js/allocator.js`, `backend/service.js` and `backend/repository.js` so you can explain the code.
3. Push the repository to your team's GitHub account using `GIT_WORKFLOW.md`.
4. Run `npm test` and keep the terminal ready.
5. If you plan to claim MySQL integration, install dependencies, execute the schema and seed, switch to MySQL mode and verify an actual saved plan. Otherwise describe MySQL persistence as implemented but awaiting live integration verification.
6. Confirm who will explain each module. No member assignments are assumed in the slides.

## Five minute presentation and demo

**Opening, 30 seconds:** “Our project automates examination seating. The administrator selects divisions, rooms and a seating strategy. The implementation generates a plan only when it seats every student without violating the selected constraints.”

**Modules, 45 seconds:** Show the source folder structure. Explain the UI, shared graph allocator, backend service, storage repository and database scripts.

**Working demo, 90 seconds:** Run `npm run demo`, open localhost:3000, click Load Demo Inputs and generate shuffled seating. Four divisions contribute 20 students each. Three 5×6 rooms provide 90 seats. Show all 80 assigned students, 10 empty seats and zero conflicts. Switch to column mode and regenerate. Explain why a division can repeat vertically in column mode.

**Error handling, 30 seconds:** Uncheck Room 103 and regenerate. The 60 remaining seats cannot hold 80 students, so the app reports Insufficient Seats and removes the old result. For a constraint failure, restore one room, select CE-A only and generate: 20 students cannot fit in one 5×6 room under either rule even though raw capacity is 30.

**Export, 15 seconds:** Download the CSV, then open Print / Save PDF. Show the room grids and exam metadata in preview.

**Git and tests, 60 seconds:** Show GitHub, `git branch --all`, `git log --oneline --graph --all`, and `npm test`. Explain feature branches, conventional commits and merge review.

**Closing, 30 seconds:** State the verified scope accurately. The sample-data UI, allocator, shared backend service and zero-install HTTP adapter have been tested. Live MySQL and installed Express need local verification. Next steps include student administration, login/access control and larger-scale solver tuning.

## Viva answers

**Why use graph coloring?** A seat or column is a vertex, an adjacency constraint is an edge, and a division is a color. Neighbouring occupied vertices need different colors.

**Are students vertices?** In this implementation, usable seats are vertices in shuffled mode and complete usable columns are vertices in column mode. Students fill the chosen division's vertices.

**Why not simply alternate A and B?** Two divisions may have unequal counts, and examinations may include more divisions or multiple rooms. The solver considers remaining counts and backtracks when needed.

**What does DAA contribute?** Candidate ordering, remaining-capacity pruning, backtracking and bounded search. It does not guarantee polynomial-time solving.

**What if capacity is sufficient but no arrangement exists?** The API returns a constraint error after completing the bounded search without a solution. Hitting the search budget returns a different error and does not establish infeasibility.

**What is the time complexity?** Graph construction is linear in vertices and edges. Backtracking has exponential worst-case complexity. This prototype uses a state and time budget.

**Does shuffled mode randomly shuffle students?** No. It distributes divisions seat by seat and assigns each division's students in roll-number order. The name refers to the mixed division layout.

**Why are there empty seats?** The adjacency rules can require separation. Capacity exceeding the student count also creates empty seats.

**Why use the same allocator in browser and backend?** It keeps both demo and backend behavior consistent. The backend refetches its own records and validates selections instead of trusting a plan sent by the browser.

**How do you prevent duplicates?** The input rejects duplicate student IDs. Output validation checks each student and seat. MySQL also has unique constraints scoped to each plan.

**Why add seating_plan?** It stores the exam metadata and identifies each generated arrangement, so multiple plans can coexist. It is a documented extension of Phase 2, with no separate EXAM table.

**Why a transaction?** Plan metadata and all seat assignments must save together. A failed insert rolls back both.

**Are diagonal neighbours restricted?** No. The supplied design defines only horizontal and vertical seat edges. Column mode restricts adjacent columns.

**What is currently stored in the demo?** File mode keeps a plan in browser memory. The Node demo stores up to 100 plans in server memory. MySQL mode writes persistent records when configured and verified locally.

**Is room utilization globally optimal?** No. The algorithm finds a complete valid assignment for selected rooms. It does not minimize the number of rooms.

**How will the team use Git?** Work on separate feature branches, commit each real change with a conventional prefix, review a pull request, run tests and merge into main.
