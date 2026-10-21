# Exam Seating Arrangement Generator — Phase 4

Semester V mini project, Sardar Patel Institute of Technology, Mumbai.
Team: Rewan Kadam (2024300099), Anish Kumar Karlupia (2024300107), Keshav Raina (2024300188).
Guide: Prof. Govind Gaundalkar.

## Windows setup

Install Node.js 20.12 or newer and MySQL Server 8.0.16 or newer with MySQL Workbench. Start your MySQL Windows service. Extract the project ZIP and open the extracted folder in VS Code.

In PowerShell, from the folder containing package.json:

~~~powershell
npm install
Copy-Item .env.example .env
notepad .env
~~~

Set DB_HOST=127.0.0.1, DB_PORT=3306, DB_USER and DB_PASSWORD to your actual local MySQL credentials. Keep DB_NAME=exam_seating unless you also change the schema database name. Set ADMIN_USERNAME to your chosen login and ADMIN_PASSWORD to a private password of 12–256 characters. Quote values containing # or spaces. No administrator account is preconfigured. Never commit .env.

In MySQL Workbench, connect to your local server, select File → Open SQL Script, open database/schema.sql, and execute the entire script using the lightning button. This creates the database and its five empty tables. Refresh Schemas.

Alternatively, start the MySQL command-line client from PowerShell (adjust the installed version path):

~~~powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
~~~

At the mysql> prompt, use your actual extracted path, with forward slashes:

~~~sql
SOURCE C:/Users/rewan/OneDrive/Desktop/coding/exam-seating/database/schema.sql;
SHOW TABLES FROM exam_seating;
EXIT;
~~~

Then, in PowerShell:

~~~powershell
npm run dev
~~~

Open http://localhost:3000 and sign in with the values you set in .env. Ctrl+C stops the server. Opening index.html directly is not supported. If PowerShell blocks npm.ps1, use npm.cmd in the same commands.

MySQL is required: startup fails with a clear error if the database is unreachable. A missing schema or a later database failure produces an API error; there is no fallback storage.

## Use the application

1. Expand Add classroom and save the room ID, number, rows, columns and usable capacity.
2. Upload a UTF-8 CSV with headers: student_id,name,roll_no,division. Use actual student records. Roll numbers must be positive integers and unique within a division; student IDs must be unique. Up to 600 records per upload. Imports add records; duplicates reject the entire batch.
3. Enter the exam title, date and session start time. Select divisions and rooms; search, floor selection, bulk selection and Auto Select Rooms remain available.
4. Choose a strategy and Generate Seating Arrangement. The backend allocates, validates and commits the plan and seat records in one transaction.
5. View each room grid and its expandable student roster. Download CSV or choose Print / Save PDF → Save as PDF. Use A4 landscape, default scale, and turn off browser headers/footers.
6. Use Saved arrangements to retrieve the latest 100 plans. Restart the server, sign in again and open a saved plan to verify persistence.

The college sheets include title, date/session, room, roll/ID, row/column/seat and signature space. Wide grids are split into groups of eight columns. Print pagination and PDF readability still need browser verification on your computer.

## Seating rules and limits

Shuffled seating disallows equal divisions in horizontally or vertically adjacent occupied seats. Column seating assigns one division per occupied column and disallows equal divisions in adjacent occupied columns. Empty separators are permitted. There is no separate subject-enrolment rule in the original project; the title is examination metadata.

The existing bounded graph-search allocator supports at most 600 physical seats per generation request, 200,000 search states and a two-second search budget. A search-limit response does not prove infeasibility. Add rooms within the supported limit or split the exam into batches. Auto Select checks candidate room sets in the browser; the saved arrangement is always independently generated and validated by the backend.

Student, classroom and plan data are persistent in MySQL. Login sessions are temporary server memory; restarting requires signing in again. The app binds to localhost for the intended local evaluation.

## Tests

~~~powershell
npm test
~~~

Unit and HTTP tests use fixtures inside tests only. They do not connect to your real database except the explicitly enabled live-MySQL suite. The connection-failure test targets an unused local port.

For live database testing, make a separate schema: open database/schema.sql in a new Workbench query, change BOTH exam_seating occurrences to exam_seating_test, and run it. Your DB_USER must have access to this test schema. Then:

~~~powershell
$env:TEST_DB_NAME = "exam_seating_test"
npm test
Remove-Item Env:TEST_DB_NAME
~~~

The test loads credentials from .env, adds uniquely prefixed records, checks both strategies, duplicate rejection, rollback and persistence after reconnect, then deletes only its test records. Never use your production schema as TEST_DB_NAME. An interrupted run may leave prefixed test records.

See PHASE4.md for executed results, limitations, APIs and the evaluation walkthrough.
