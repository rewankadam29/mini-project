CREATE DATABASE IF NOT EXISTS exam_seating CHARACTER SET utf8mb4;
USE exam_seating;

CREATE TABLE IF NOT EXISTS division (
  division_id INT PRIMARY KEY AUTO_INCREMENT,
  division_name VARCHAR(40) NOT NULL UNIQUE,
  department VARCHAR(80) NOT NULL
);
CREATE TABLE IF NOT EXISTS student (
  student_id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  roll_no INT NOT NULL CHECK (roll_no > 0),
  division_id INT NOT NULL,
  UNIQUE (division_id, roll_no),
  FOREIGN KEY (division_id) REFERENCES division(division_id)
);
CREATE TABLE IF NOT EXISTS room (
  room_id VARCHAR(40) PRIMARY KEY,
  room_number VARCHAR(40) NOT NULL UNIQUE,
  `rows` INT NOT NULL CHECK (`rows` > 0),
  `columns` INT NOT NULL CHECK (`columns` > 0),
  capacity INT NOT NULL,
  CHECK (capacity > 0 AND capacity <= `rows` * `columns`)
);
-- Stores each generated plan's metadata. There is no separate EXAM table.
CREATE TABLE IF NOT EXISTS seating_plan (
  plan_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_name VARCHAR(150) NOT NULL,
  exam_date DATE NOT NULL,
  exam_time TIME NOT NULL,
  strategy ENUM('shuffled','column') NOT NULL,
  snapshot_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS seating (
  seating_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  plan_id BIGINT NOT NULL,
  student_id VARCHAR(40) NOT NULL,
  room_id VARCHAR(40) NOT NULL,
  seat_number INT NOT NULL CHECK (seat_number > 0),
  row_number INT NOT NULL CHECK (row_number > 0),
  column_number INT NOT NULL CHECK (column_number > 0),
  UNIQUE (plan_id, student_id),
  UNIQUE (plan_id, room_id, seat_number),
  UNIQUE (plan_id, room_id, row_number, column_number),
  FOREIGN KEY (plan_id) REFERENCES seating_plan(plan_id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES student(student_id),
  FOREIGN KEY (room_id) REFERENCES room(room_id)
);
