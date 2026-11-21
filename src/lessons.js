/**
 * Уроки-примеры для тренажёра.
 *
 * Первый урок живёт в движке (SAMPLE) — он отдаётся через engine.getSample(),
 * чтобы текст оставался единственным источником правды.
 * Остальные уроки — здесь: они не трогают движок.
 *
 * Тексты уроков 2 и 3 — как на слайдах курса.
 */

export const LESSONS = [
  {
    id: 'first',
    title: 'Первый урок',
    hint: 'CREATE DATABASE · CREATE TABLE · INSERT · SELECT TOP',
    fromEngine: true,
  },
  {
    id: 'primary-key',
    title: 'SQL Server: bază de date + 2 tabele (PRIMARY KEY)',
    hint: 'CREATE DATABASE · 2 tabele · IDENTITY · INSERT · SELECT',
    sql: `CREATE DATABASE SchoolDB;
GO

USE SchoolDB;
GO

CREATE TABLE Classes (
  ClassID   INT IDENTITY(1,1) PRIMARY KEY,
  ClassName NVARCHAR(50) NOT NULL,
  Room      INT
);

CREATE TABLE Students (
  StudentID INT IDENTITY(1,1) PRIMARY KEY,
  FirstName NVARCHAR(50) NOT NULL,
  Age       INT
);
GO

INSERT INTO Classes (ClassName, Room) VALUES ('Java', 101), ('Databases', 202);
INSERT INTO Students (FirstName, Age) VALUES ('Ion', 15), ('Maria', 16);

SELECT * FROM Classes;
SELECT * FROM Students;`,
  },
  {
    id: 'foreign-key',
    title: 'Legăm tabelele: FOREIGN KEY (ALTER TABLE)',
    hint: 'ALTER TABLE · ADD CONSTRAINT · UPDATE · JOIN',
    needs: 'SQL Server: bază de date + 2 tabele (PRIMARY KEY)',
    sql: `USE SchoolDB;
GO

-- 0. Eliminăm Age (rămân max 3 câmpuri)
ALTER TABLE Students DROP COLUMN Age;
GO

-- 1. Coloana pentru legătură
ALTER TABLE Students ADD ClassID INT;
GO

-- 2. O facem cheie străină (FOREIGN KEY) spre Classes
ALTER TABLE Students
ADD CONSTRAINT FK_Students_Classes
FOREIGN KEY (ClassID) REFERENCES Classes(ClassID);
GO

-- 3. Atribuim clasele elevilor
UPDATE Students SET ClassID = 1 WHERE FirstName = 'Ion';
UPDATE Students SET ClassID = 2 WHERE FirstName = 'Maria';

-- 4. Verificăm legătura
SELECT s.FirstName, c.ClassName, c.Room
FROM Students s
JOIN Classes c ON s.ClassID = c.ClassID;`,
  },
]
