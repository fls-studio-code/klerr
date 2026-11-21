/**
 * Примеры для меню «Примеры» — по урокам курса «Базы данных» (SQL Server).
 *
 * Код повторяет слайды и домашние задания уроков 1–4. Каждый пример можно
 * запускать повторно: базы создаются через IF DB_ID(…) IS NULL, таблицы
 * пересоздаются через DROP TABLE IF EXISTS. Если пример опирается на таблицу
 * из другого примера, это указано в поле needs.
 */

export const WELCOME = `-- Добро пожаловать в Klerr SQL Trainer!
-- Здесь работает синтаксис Microsoft SQL Server (T-SQL), как в SSMS.
--
--   F5 или Ctrl+Enter — выполнить весь текст
--   выдели часть текста — выполнится только она
--   «Примеры» вверху — готовый код к урокам 1–4

IF DB_ID('SchoolDB') IS NULL
    CREATE DATABASE SchoolDB;
GO

USE SchoolDB;
GO

DROP TABLE IF EXISTS Students;

CREATE TABLE Students (
    StudentID INT PRIMARY KEY,
    FirstName NVARCHAR(50),
    LastName  NVARCHAR(50),
    Age       INT
);

INSERT INTO Students (StudentID, FirstName, LastName, Age)
VALUES (1, 'Alice', 'Johnson', 14),
       (2, 'Emma', 'Brown', 13),
       (3, 'Liam', 'Wilson', 14);

SELECT * FROM Students;
`

const SCHOOL = `IF DB_ID('SchoolDB') IS NULL
    CREATE DATABASE SchoolDB;
GO

USE SchoolDB;
GO
`

export const LESSONS = [
  {
    lesson: 1,
    title: 'Урок 1 · База данных и типы данных',
    items: [
      {
        id: 'l1-create-db',
        title: 'Первая база данных SchoolDB',
        hint: 'CREATE DATABASE · USE · GO',
        sql: `-- Урок 1. Создаём базу данных и переключаемся на неё.
-- В SSMS после этого нажми Refresh в Object Explorer — здесь список
-- обновляется сам.

-- IF DB_ID(...) IS NULL — создаём базу, только если её ещё нет,
-- чтобы пример можно было запускать много раз.
IF DB_ID('SchoolDB') IS NULL
    CREATE DATABASE SchoolDB;
GO

-- USE переключает нас на эту базу: все следующие команды работают в ней.
USE SchoolDB;
GO

-- Проверим, в какой базе мы сейчас:
SELECT DB_NAME() AS CurrentDatabase;
`,
      },
      {
        id: 'l1-students',
        title: 'Таблица Students и INSERT INTO',
        hint: 'CREATE TABLE · PRIMARY KEY · INSERT · SELECT',
        sql: `${SCHOOL}
-- Таблица из четырёх колонок:
--   StudentID — уникальный номер ученика (первичный ключ),
--   FirstName и LastName — текст, Age — число.
DROP TABLE IF EXISTS Students;

CREATE TABLE Students (
    StudentID INT PRIMARY KEY,
    FirstName NVARCHAR(50),
    LastName  NVARCHAR(50),
    Age       INT
);
GO

-- Добавляем строку: ID 1, имя Alice, фамилия Johnson, возраст 14.
INSERT INTO Students (StudentID, FirstName, LastName, Age)
VALUES (1, 'Alice', 'Johnson', 14);

-- Смотрим, что лежит в таблице (как «Select Top 1000 Rows» в SSMS).
SELECT * FROM Students;
`,
      },
      {
        id: 'l1-task',
        title: 'Задание: ещё 6 учеников',
        hint: 'INSERT INTO … VALUES (…), (…)',
        needs: 'l1-students',
        sql: `USE SchoolDB;
GO

-- Задание: добавить 6 новых учеников одной командой INSERT INTO.
-- Ответ со слайда:
INSERT INTO Students (StudentID, FirstName, LastName, Age)
VALUES
(2, 'Emma',   'Brown',    13),
(3, 'Liam',   'Wilson',   14),
(4, 'Mia',    'Davis',    15),
(5, 'Noah',   'Miller',   14),
(6, 'Olivia', 'Taylor',   13),
(7, 'Lucas',  'Anderson', 15);

SELECT * FROM Students;
GO

-- Попробуй ещё раз добавить ученика с StudentID = 1:
-- первичный ключ не даст создать дубликат.
INSERT INTO Students (StudentID, FirstName, LastName, Age)
VALUES (1, 'Copy', 'Of Alice', 14);
`,
      },
      {
        id: 'l1-types',
        title: 'Типы данных: проверяем на практике',
        hint: 'TINYINT · DECIMAL · BIT · VARCHAR · DATE · DATETIME2 · SMALLDATETIME',
        sql: `${SCHOOL}
-- Каждая колонка хранит значения своего типа.
-- Тренажёр проверяет типы так же, как SQL Server.
DROP TABLE IF EXISTS TypeDemo;

CREATE TABLE TypeDemo (
    Id        INT IDENTITY(1,1) PRIMARY KEY, -- целое, нумеруется само
    Score     TINYINT,        -- целое 0…255
    Points    SMALLINT,       -- целое −32 768…32 767
    Price     DECIMAL(6, 2),  -- 6 цифр, из них 2 после запятой
    IsActive  BIT,            -- 1 / 0 (да / нет)
    Code      CHAR(3),        -- строка фиксированной длины
    Name      VARCHAR(10),    -- строка до 10 символов
    BirthDate DATE,           -- 'YYYY-MM-DD'
    CreatedAt DATETIME2(3),   -- дата + время, 3 знака долей секунды
    Meeting   SMALLDATETIME   -- 1900-01-01 … 2079-06-06, точность — минута
);
GO

INSERT INTO TypeDemo (Score, Points, Price, IsActive, Code, Name, BirthDate, CreatedAt, Meeting)
VALUES (200, 1024, 19.999, 1, 'USA', 'Alice', '2011/05/14', '2025-01-04 12:30:45.1234567', '2025-01-04 12:30:00');

-- DECIMAL(6,2) округлил 19.999 до 20, DATE привёл 2011/05/14 к 2011-05-14,
-- DATETIME2(3) оставил три знака долей секунды.
SELECT * FROM TypeDemo;
GO

-- Дальше — значения, которые НЕ помещаются в тип.
-- Каждый INSERT отделён GO, поэтому после ошибки выполнение продолжится.
-- Посмотри вкладку Messages.

INSERT INTO TypeDemo (Score) VALUES (300);              -- TINYINT максимум 255
GO
INSERT INTO TypeDemo (Name) VALUES ('Christopher');     -- больше 10 символов
GO
INSERT INTO TypeDemo (Price) VALUES (12345.67);         -- больше 4 цифр до запятой
GO
INSERT INTO TypeDemo (BirthDate) VALUES ('2025-02-30'); -- такой даты нет
GO

-- Вопрос со слайда: какие значения поместятся в SMALLDATETIME?
INSERT INTO TypeDemo (Meeting) VALUES ('1753-01-01 00:00:00'); -- раньше 1900 года
GO
INSERT INTO TypeDemo (Meeting) VALUES ('2079-06-06 23:59:20'); -- округлится до 23:59
GO
INSERT INTO TypeDemo (Meeting) VALUES ('2079-06-06 23:59:40'); -- округлится до 2079-06-07 — вне диапазона
GO

SELECT Id, Meeting FROM TypeDemo;
`,
      },
      {
        id: 'l1-hw',
        title: 'Домашнее задание: таблица Books',
        hint: 'выбор типов данных · INSERT',
        sql: `${SCHOOL}
-- Домашнее задание урока 1: таблица книг для библиотеки.
-- Один из вариантов решения:
DROP TABLE IF EXISTS Books;

CREATE TABLE Books (
    BookID        INT PRIMARY KEY,   -- уникальный номер книги
    Title         NVARCHAR(100),     -- название
    Author        NVARCHAR(100),     -- автор
    Genre         NVARCHAR(30),      -- Fiction, Mystery, Science…
    Pages         SMALLINT,          -- страниц: хватит до 32 767
    PublishedYear SMALLINT,          -- год издания
    Rating        DECIMAL(3, 1)      -- например 4.5
);
GO

INSERT INTO Books (BookID, Title, Author, Genre, Pages, PublishedYear, Rating)
VALUES
(1, 'The Hobbit',            'J. R. R. Tolkien', 'Fantasy', 310, 1937, 4.8),
(2, 'Murder on the Orient Express', 'Agatha Christie', 'Mystery', 256, 1934, 4.6),
(3, 'A Brief History of Time', 'Stephen Hawking', 'Science', 212, 1988, 4.4);

SELECT * FROM Books;
`,
      },
    ],
  },
  {
    lesson: 2,
    title: 'Урок 2 · Ключи и связи',
    items: [
      {
        id: 'l2-pk',
        title: 'PRIMARY KEY: каждая строка уникальна',
        hint: 'PRIMARY KEY · CONSTRAINT · дубликат',
        sql: `${SCHOOL}
-- Первичный ключ — колонка, которая однозначно определяет строку.
-- Правила: значения уникальны, NULL нельзя, ключ в таблице один.
DROP TABLE IF EXISTS Students;

CREATE TABLE Students (
    StudentID INT NOT NULL,
    FirstName NVARCHAR(50),
    LastName  NVARCHAR(50),
    Age       INT,
    CONSTRAINT PK_Students PRIMARY KEY (StudentID)
);
GO

-- Два ученика с одинаковым именем — не проблема: их различает StudentID.
INSERT INTO Students VALUES (1, 'Alice', 'Brown', 14);
INSERT INTO Students VALUES (2, 'Alice', 'Brown', 14);
SELECT * FROM Students;
GO

-- А вот повторить StudentID нельзя:
INSERT INTO Students VALUES (1, 'Bob', 'Smith', 15);
GO

-- И оставить ключ пустым тоже нельзя:
INSERT INTO Students (FirstName) VALUES ('NoId');
GO

-- Посмотреть ключи и ограничения таблицы:
EXEC sp_help 'Students';
`,
      },
      {
        id: 'l2-composite',
        title: 'Составной ключ: CourseEnrollments',
        hint: 'PRIMARY KEY (StudentID, CourseID)',
        sql: `${SCHOOL}
-- Задание со слайда: кто на какой курс записан.
-- Один ученик ходит на несколько курсов, на курсе — много учеников,
-- поэтому ни StudentID, ни CourseID по отдельности ключом быть не могут.
-- Уникальна только их пара — это составной (composite) ключ.
DROP TABLE IF EXISTS CourseEnrollments;

CREATE TABLE CourseEnrollments (
    StudentID      INT  NOT NULL,
    CourseID       INT  NOT NULL,
    EnrollmentDate DATE,
    CONSTRAINT PK_CourseEnrollments PRIMARY KEY (StudentID, CourseID)
);
GO

INSERT INTO CourseEnrollments VALUES
(1, 101, '2025-09-01'),
(1, 102, '2025-09-01'),   -- тот же ученик, другой курс — можно
(2, 101, '2025-09-02'),   -- другой ученик, тот же курс — можно
(3, 103, '2025-09-03');

SELECT * FROM CourseEnrollments;
GO

-- Полный дубликат пары (1, 101) — ошибка, как в последней строке таблицы на слайде:
INSERT INTO CourseEnrollments VALUES (1, 101, '2025-09-05');
`,
      },
      {
        id: 'l2-fk',
        title: 'FOREIGN KEY: Department и Employee',
        hint: 'FOREIGN KEY · REFERENCES · ошибка 547',
        sql: `${SCHOOL}
-- Вопрос со слайда: сотрудник должен работать только в существующем отделе.
-- Решение — внешний ключ (FOREIGN KEY) в таблице Employee.
DROP TABLE IF EXISTS Employee;   -- сначала дочернюю таблицу
DROP TABLE IF EXISTS Department; -- потом родительскую

CREATE TABLE Department (
    DepartmentID INT PRIMARY KEY,
    Name         NVARCHAR(50) NOT NULL
);

CREATE TABLE Employee (
    EmployeeID   INT PRIMARY KEY,
    FullName     NVARCHAR(100) NOT NULL,
    DepartmentID INT,
    CONSTRAINT FK_Employee_Department
        FOREIGN KEY (DepartmentID) REFERENCES Department(DepartmentID)
);
GO

INSERT INTO Department VALUES (1, 'IT'), (2, 'Sales');
INSERT INTO Employee VALUES (1, 'Ana Popescu', 1), (2, 'Ion Rusu', 2);

SELECT e.FullName, d.Name AS Department
FROM Employee e
JOIN Department d ON e.DepartmentID = d.DepartmentID;
GO

-- Отдела 5 нет — внешний ключ не пустит такую строку:
INSERT INTO Employee VALUES (3, 'Maria Ceban', 5);
GO

-- Удалить отдел, в котором есть сотрудники, тоже нельзя:
DELETE FROM Department WHERE DepartmentID = 1;
`,
      },
      {
        id: 'l2-alter-fk',
        title: 'Связываем готовые таблицы (ALTER TABLE)',
        hint: 'ALTER TABLE · ADD CONSTRAINT · UPDATE · JOIN',
        sql: `${SCHOOL}
-- Две независимые таблицы: классы и ученики.
DROP TABLE IF EXISTS Students;
DROP TABLE IF EXISTS Classes;

CREATE TABLE Classes (
    ClassID   INT IDENTITY(1,1) PRIMARY KEY,
    ClassName NVARCHAR(50) NOT NULL,
    Room      INT
);

CREATE TABLE Students (
    StudentID INT IDENTITY(1,1) PRIMARY KEY,
    FirstName NVARCHAR(50) NOT NULL
);
GO

INSERT INTO Classes (ClassName, Room) VALUES ('Java', 101), ('Databases', 202);
INSERT INTO Students (FirstName) VALUES ('Ion'), ('Maria');
GO

-- 1. Колонка для связи
ALTER TABLE Students ADD ClassID INT;
GO

-- 2. Делаем её внешним ключом на Classes
ALTER TABLE Students
ADD CONSTRAINT FK_Students_Classes
FOREIGN KEY (ClassID) REFERENCES Classes(ClassID);
GO

-- 3. Назначаем ученикам классы
UPDATE Students SET ClassID = 1 WHERE FirstName = 'Ion';
UPDATE Students SET ClassID = 2 WHERE FirstName = 'Maria';

-- 4. Проверяем связь
SELECT s.FirstName, c.ClassName, c.Room
FROM Students s
JOIN Classes c ON s.ClassID = c.ClassID;
`,
      },
      {
        id: 'l2-relations',
        title: 'Связи: 1:1, 1:N и N:M',
        hint: 'One-to-One · One-to-Many · Many-to-Many',
        sql: `${SCHOOL}
DROP TABLE IF EXISTS Passports;
DROP TABLE IF EXISTS People;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Customers;
DROP TABLE IF EXISTS BookAuthors;
DROP TABLE IF EXISTS Authors;
DROP TABLE IF EXISTS LibraryBooks;
GO

-- One-to-One: у человека один паспорт, паспорт принадлежит одному человеку.
-- UNIQUE на внешнем ключе не даёт завести второй паспорт.
CREATE TABLE People (
    PersonID INT PRIMARY KEY,
    FullName NVARCHAR(100)
);
CREATE TABLE Passports (
    PassportID INT PRIMARY KEY,
    Number     VARCHAR(20),
    PersonID   INT UNIQUE REFERENCES People(PersonID)
);

-- One-to-Many: у покупателя много заказов, у заказа один покупатель.
CREATE TABLE Customers (
    CustomerID INT PRIMARY KEY,
    Name       NVARCHAR(100)
);
CREATE TABLE Orders (
    OrderID    INT PRIMARY KEY,
    OrderDate  DATE,
    CustomerID INT REFERENCES Customers(CustomerID)
);

-- Many-to-Many: у книги много авторов, у автора много книг.
-- Нужна промежуточная таблица с составным ключом.
CREATE TABLE LibraryBooks (
    BookID INT PRIMARY KEY,
    Title  NVARCHAR(100)
);
CREATE TABLE Authors (
    AuthorID INT PRIMARY KEY,
    Name     NVARCHAR(100)
);
CREATE TABLE BookAuthors (
    BookID   INT REFERENCES LibraryBooks(BookID),
    AuthorID INT REFERENCES Authors(AuthorID),
    CONSTRAINT PK_BookAuthors PRIMARY KEY (BookID, AuthorID)
);
GO

INSERT INTO People VALUES (1, 'Emma Lee'), (2, 'Noah Brown');
INSERT INTO Passports VALUES (10, 'AB123456', 1), (11, 'CD654321', 2);

INSERT INTO Customers VALUES (1, 'Olivia'), (2, 'Liam');
INSERT INTO Orders VALUES (100, '2025-07-01', 1), (101, '2025-07-03', 1), (102, '2025-07-05', 2);

INSERT INTO LibraryBooks VALUES (1, 'Good Omens'), (2, 'Discworld');
INSERT INTO Authors VALUES (1, 'Terry Pratchett'), (2, 'Neil Gaiman');
INSERT INTO BookAuthors VALUES (1, 1), (1, 2), (2, 1);

SELECT c.Name, o.OrderID, o.OrderDate
FROM Customers c JOIN Orders o ON o.CustomerID = c.CustomerID;

SELECT b.Title, a.Name AS Author
FROM LibraryBooks b
JOIN BookAuthors ba ON ba.BookID = b.BookID
JOIN Authors a ON a.AuthorID = ba.AuthorID;
GO

-- Второй паспорт тому же человеку — нарушение связи 1:1:
INSERT INTO Passports VALUES (12, 'EF000000', 1);
`,
      },
      {
        id: 'l2-adventureworks',
        title: 'Мини-AdventureWorks: схема Person',
        hint: 'CREATE SCHEMA · Person.Person · составной ключ · FK',
        sql: `-- Уменьшенная копия AdventureWorks2019 (схемы Person и Sales) —
-- с её таблицами работают на уроке 2. Данные — из sample_data.sql курса.
-- Полную базу ставят в SSMS из файла .bak (кнопка AdventureWorks на главной).
IF DB_ID('AdventureWorksLite') IS NULL
    CREATE DATABASE AdventureWorksLite;
GO

USE AdventureWorksLite;
GO

DROP TABLE IF EXISTS Sales.SalesOrderDetail;
DROP TABLE IF EXISTS Sales.SalesOrderHeader;
DROP TABLE IF EXISTS Person.EmailAddress;
DROP TABLE IF EXISTS Person.Address;
DROP TABLE IF EXISTS Person.StateProvince;
DROP TABLE IF EXISTS Person.CountryRegion;
DROP TABLE IF EXISTS Person.Person;
GO

IF SCHEMA_ID('Person') IS NULL EXEC('CREATE SCHEMA Person');
GO
IF SCHEMA_ID('Sales') IS NULL EXEC('CREATE SCHEMA Sales');
GO

CREATE TABLE Person.Person (
    BusinessEntityID INT NOT NULL CONSTRAINT PK_Person_BusinessEntityID PRIMARY KEY,
    PersonType       NCHAR(2) NOT NULL,
    Title            NVARCHAR(8),
    FirstName        NVARCHAR(50) NOT NULL,
    MiddleName       NVARCHAR(50),
    LastName         NVARCHAR(50) NOT NULL,
    EmailPromotion   INT NOT NULL CONSTRAINT DF_Person_EmailPromotion DEFAULT 0,
    ModifiedDate     DATETIME NOT NULL CONSTRAINT DF_Person_ModifiedDate DEFAULT GETDATE()
);

-- Составной ключ: у человека может быть несколько адресов почты.
CREATE TABLE Person.EmailAddress (
    BusinessEntityID INT NOT NULL,
    EmailAddressID   INT NOT NULL,
    EmailAddress     NVARCHAR(50),
    CONSTRAINT PK_EmailAddress_BusinessEntityID_EmailAddressID
        PRIMARY KEY (BusinessEntityID, EmailAddressID),
    CONSTRAINT FK_EmailAddress_Person_BusinessEntityID
        FOREIGN KEY (BusinessEntityID) REFERENCES Person.Person(BusinessEntityID)
);

CREATE TABLE Person.CountryRegion (
    CountryRegionCode NVARCHAR(3) NOT NULL CONSTRAINT PK_CountryRegion_CountryRegionCode PRIMARY KEY,
    Name              NVARCHAR(50) NOT NULL
);

CREATE TABLE Person.StateProvince (
    StateProvinceID   INT NOT NULL CONSTRAINT PK_StateProvince_StateProvinceID PRIMARY KEY,
    StateProvinceCode NCHAR(3) NOT NULL,
    CountryRegionCode NVARCHAR(3) NOT NULL
        CONSTRAINT FK_StateProvince_CountryRegion REFERENCES Person.CountryRegion(CountryRegionCode),
    Name              NVARCHAR(50) NOT NULL
);

CREATE TABLE Person.Address (
    AddressID       INT NOT NULL CONSTRAINT PK_Address_AddressID PRIMARY KEY,
    AddressLine1    NVARCHAR(60) NOT NULL,
    City            NVARCHAR(30) NOT NULL,
    StateProvinceID INT NOT NULL
        CONSTRAINT FK_Address_StateProvince REFERENCES Person.StateProvince(StateProvinceID),
    PostalCode      NVARCHAR(15) NOT NULL
);

CREATE TABLE Sales.SalesOrderHeader (
    SalesOrderID INT NOT NULL CONSTRAINT PK_SalesOrderHeader_SalesOrderID PRIMARY KEY,
    OrderDate    DATETIME NOT NULL,
    CustomerID   INT NOT NULL,
    TotalDue     MONEY NOT NULL
);

CREATE TABLE Sales.SalesOrderDetail (
    SalesOrderID       INT NOT NULL
        CONSTRAINT FK_SalesOrderDetail_SalesOrderHeader REFERENCES Sales.SalesOrderHeader(SalesOrderID),
    SalesOrderDetailID INT NOT NULL,
    ProductName        NVARCHAR(50) NOT NULL,
    OrderQty           SMALLINT NOT NULL,
    UnitPrice          MONEY NOT NULL,
    CONSTRAINT PK_SalesOrderDetail_SalesOrderID_SalesOrderDetailID
        PRIMARY KEY (SalesOrderID, SalesOrderDetailID)
);
GO

INSERT INTO Person.Person (BusinessEntityID, PersonType, Title, FirstName, MiddleName, LastName, EmailPromotion) VALUES
(1, 'EM', 'Mr.', 'Ken',     'J',  'Sanchez',    0),
(2, 'EM', 'Ms.', 'Terri',   NULL, 'Lee',        1),
(3, 'EM', 'Mr.', 'Roberto', NULL, 'Tamburello', 0),
(4, 'EM', 'Ms.', 'Gail',    'A',  'Erickson',   1),
(5, 'EM', 'Mr.', 'Jossef',  'A',  'Goldberg',   0);

INSERT INTO Person.EmailAddress VALUES
(1, 1, 'ken.sanchez@example.com'),
(1, 2, 'ken.j@example.com'),
(2, 1, 'terri.lee@example.com'),
(3, 1, 'roberto.t@example.com');

INSERT INTO Person.CountryRegion VALUES ('CAN', 'Canada'), ('USA', 'United States');
INSERT INTO Person.StateProvince VALUES
(1, 'WA', 'USA', 'Washington'),
(2, 'OR', 'USA', 'Oregon'),
(3, 'BC', 'CAN', 'British Columbia');
INSERT INTO Person.Address VALUES
(1, '123 Main St',   'Seattle',   1, '98101'),
(2, '45 Oak Avenue', 'Portland',  2, '97201'),
(3, '77 Pine Road',  'Vancouver', 3, 'V6B1A1');

INSERT INTO Sales.SalesOrderHeader VALUES
(43659, '2025-07-01', 1, 120.50),
(43660, '2025-07-02', 2,  45.00);
INSERT INTO Sales.SalesOrderDetail VALUES
(43659, 1, 'Mountain Bike Socks', 2, 9.50),
(43659, 2, 'Sport-100 Helmet',    3, 33.83),
(43660, 1, 'Water Bottle',        9, 5.00);
GO

-- «Select Top 1000 Rows» для Person.Person — как его генерирует SSMS:
SELECT TOP (1000) [BusinessEntityID], [PersonType], [Title], [FirstName], [MiddleName], [LastName]
FROM [AdventureWorksLite].[Person].[Person];

-- У Ken две почты: BusinessEntityID повторяется, но пара с EmailAddressID уникальна.
SELECT p.FirstName, p.LastName, e.EmailAddressID, e.EmailAddress
FROM Person.Person p
JOIN Person.EmailAddress e ON e.BusinessEntityID = p.BusinessEntityID;

-- Задание: найди первичные ключи таблиц. Подсказка — sp_help:
EXEC sp_help 'Sales.SalesOrderDetail';
`,
      },
    ],
  },
  {
    lesson: 3,
    title: 'Урок 3 · SQL, CRUD и SELECT',
    items: [
      {
        id: 'l3-crud',
        title: 'CRUD: база my_store',
        hint: 'CREATE · INSERT · SELECT · UPDATE · DELETE',
        sql: `-- C — Create, R — Read, U — Update, D — Delete.
IF DB_ID('my_store') IS NULL
    CREATE DATABASE my_store;
GO

USE my_store;
GO

DROP TABLE IF EXISTS products;

CREATE TABLE products (
    id    INT IDENTITY(1,1) PRIMARY KEY,
    name  VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2)
);
GO

-- Create: добавляем данные («1 row affected»)
INSERT INTO products (name, price) VALUES ('Laptop', 999.99);
INSERT INTO products (name, price) VALUES ('Mouse', 25.50);

-- Read: читаем
SELECT * FROM products;

-- Update: меняем цену
UPDATE products SET price = 899.99 WHERE name = 'Laptop';
SELECT * FROM products;

-- Delete: удаляем строку
DELETE FROM products WHERE name = 'Mouse';
SELECT * FROM products;
`,
      },
      {
        id: 'l3-bookstore',
        title: 'Задание: bookstore',
        hint: 'IDENTITY · INSERT · UPDATE · DELETE',
        sql: `-- Задание урока 3, решение по шагам.
-- 1. База bookstore
IF DB_ID('bookstore') IS NULL
    CREATE DATABASE bookstore;
GO

-- 2. Работаем в ней
USE bookstore;
GO

-- 3. Таблица books: id — автоинкремент и первичный ключ
DROP TABLE IF EXISTS books;

CREATE TABLE books (
    id    INT IDENTITY(1,1) PRIMARY KEY,
    title VARCHAR(100),
    price DECIMAL(6, 2)
);
GO

-- 4. Три книги
INSERT INTO books (title, price) VALUES
('The Great Adventure', 15.50),
('Old Tales',            9.99),
('Learning SQL',        24.00);

-- 5. Все данные
SELECT * FROM books;

-- 6. Новая цена книги "The Great Adventure"
UPDATE books SET price = 19.99 WHERE title = 'The Great Adventure';

-- 7. Удаляем "Old Tales"
DELETE FROM books WHERE title = 'Old Tales';

-- 8. Итог
SELECT * FROM books;
`,
      },
      {
        id: 'l3-null-alter',
        title: 'NULL, NOT NULL и ALTER COLUMN',
        hint: 'NOT NULL · ALTER TABLE … ALTER COLUMN',
        sql: `${SCHOOL}
-- NULL — значение отсутствует. NOT NULL — колонку обязательно заполнять.
DROP TABLE IF EXISTS BikeRepairsTest2;

CREATE TABLE BikeRepairsTest2 (
    BikeRepairID      INT NOT NULL PRIMARY KEY,
    CustomerID        INT NOT NULL,
    StartDate         DATETIME,
    EndDate           DATETIME,
    EstHour           INT,
    EstRate           MONEY NOT NULL,
    RepairDescription VARCHAR(50)
);
GO

-- EstRate объявлена NOT NULL — без неё строку не вставить:
INSERT INTO BikeRepairsTest2 (BikeRepairID, CustomerID) VALUES (1, 10);
GO

-- Разрешаем пустые значения: меняем колонку через ALTER COLUMN (как на слайде).
ALTER TABLE BikeRepairsTest2
ALTER COLUMN EstRate MONEY NULL;
GO

-- Теперь вставка проходит, а в EstRate будет NULL.
INSERT INTO BikeRepairsTest2 (BikeRepairID, CustomerID) VALUES (1, 10);
SELECT * FROM BikeRepairsTest2;

-- ALTER умеет и другое:
ALTER TABLE BikeRepairsTest2 ADD Notes VARCHAR(200);              -- добавить колонку
ALTER TABLE BikeRepairsTest2 ALTER COLUMN RepairDescription VARCHAR(100); -- сменить тип
ALTER TABLE BikeRepairsTest2 DROP COLUMN Notes;                   -- удалить колонку
EXEC sp_rename 'BikeRepairsTest2.EstHour', 'EstHours', 'COLUMN';  -- переименовать колонку

EXEC sp_help 'BikeRepairsTest2';
`,
      },
      {
        id: 'l3-constraints',
        title: 'CONSTRAINT: именованные ограничения',
        hint: 'CHECK · UNIQUE · DEFAULT · DROP CONSTRAINT',
        sql: `${SCHOOL}
-- CONSTRAINT дает ограничению имя — по нему его потом меняют или удаляют.
DROP TABLE IF EXISTS Members;

CREATE TABLE Members (
    MemberID INT IDENTITY(1,1) CONSTRAINT PK_Members PRIMARY KEY,
    Email    VARCHAR(100) NOT NULL CONSTRAINT UQ_Members_Email UNIQUE,
    Age      INT CONSTRAINT CK_Members_Age CHECK (Age >= 7),
    Country  VARCHAR(30) CONSTRAINT DF_Members_Country DEFAULT 'Moldova'
);
GO

INSERT INTO Members (Email, Age) VALUES ('ana@mail.com', 15);
SELECT * FROM Members;   -- Country заполнилась значением по умолчанию
GO

INSERT INTO Members (Email, Age) VALUES ('ana@mail.com', 16);  -- UNIQUE: такой Email уже есть
GO
INSERT INTO Members (Email, Age) VALUES ('kid@mail.com', 5);   -- CHECK: Age >= 7
GO

-- Удаляем ограничение по имени — и снова пробуем:
ALTER TABLE Members DROP CONSTRAINT CK_Members_Age;
INSERT INTO Members (Email, Age) VALUES ('kid@mail.com', 5);

-- Добавляем ограничение к готовой таблице:
ALTER TABLE Members ADD CONSTRAINT CK_Members_Email CHECK (Email LIKE '%@%');
SELECT * FROM Members;
`,
      },
      {
        id: 'l3-select',
        title: 'Students: SELECT, DISTINCT, TOP',
        hint: 'SELECT колонки · DISTINCT · TOP',
        sql: `${SCHOOL}
-- Таблица из задания урока 3 (её используем и в уроке 4).
DROP TABLE IF EXISTS Students;

CREATE TABLE Students (
    StudentID INT,
    FirstName VARCHAR(50),
    LastName  VARCHAR(50),
    Age       INT,
    Grade     FLOAT,
    City      VARCHAR(50)
);

INSERT INTO Students VALUES
(1, 'Alice',  'Johnson', 14, 8.5,  'New York'),
(2, 'Bob',    'Smith',   14, 9.1,  'Chicago'),
(3, 'Alice',  'Brown',   15, 7.3,  'New York'),
(4, 'Daniel', 'Miller',  16, 8.5,  'Boston'),
(5, 'Ella',   'White',   14, NULL, 'Chicago');
GO

-- Все колонки
SELECT * FROM Students;

-- Только имя, возраст и оценка
SELECT FirstName, Age, Grade FROM Students;

-- Уникальные возрасты (DISTINCT убирает повторы)
SELECT DISTINCT Age FROM Students;

-- Первые 2 ученика, только имя и оценка (TOP — это SQL Server, LIMIT — MySQL)
SELECT TOP 2 FirstName, Grade FROM Students;

-- Без ORDER BY порядок строк не гарантирован — сортируем явно:
SELECT TOP 3 FirstName, Grade FROM Students ORDER BY Grade DESC;
`,
      },
      {
        id: 'l3-strings',
        title: 'Строковые функции',
        hint: 'UPPER · LOWER · LEN · CONCAT',
        needs: 'l3-select',
        sql: `USE SchoolDB;
GO

-- UPPER — все буквы заглавные: фамилии в верхнем регистре
SELECT UPPER(LastName) AS LastNameUpper FROM Students;

-- LOWER — все буквы строчные
SELECT LOWER(FirstName) AS FirstNameLower FROM Students;

-- LEN — число символов (в MySQL это LENGTH)
SELECT LastName, LEN(LastName) AS LastNameLength FROM Students;

-- CONCAT — склеивает строки. Формат: Bob (2)
SELECT CONCAT(FirstName, ' (', StudentID, ')') AS NameAndID FROM Students;

-- То же через +: число нужно привести к строке
SELECT FirstName + ' (' + CAST(StudentID AS VARCHAR(10)) + ')' AS NameAndID FROM Students;
`,
      },
      {
        id: 'l3-hw',
        title: 'Домашнее задание: Movies',
        hint: 'DISTINCT · TOP + ORDER BY · UPPER · LEN',
        sql: `${SCHOOL}
DROP TABLE IF EXISTS Movies;

CREATE TABLE Movies (
    MovieID     INT PRIMARY KEY,
    Title       VARCHAR(100),
    Genre       VARCHAR(30),
    ReleaseYear INT,
    Rating      DECIMAL(3, 1)
);

INSERT INTO Movies VALUES
(1, 'Inception',     'Sci-Fi',  2010, 8.8),
(2, 'The Matrix',    'Sci-Fi',  1999, 8.7),
(3, 'The Godfather', 'Crime',   1972, 9.2),
(4, 'Pulp Fiction',  'Crime',   1994, 8.9),
(5, 'Titanic',       'Romance', 1997, 7.8),
(6, 'Inception',     'Sci-Fi',  2010, 8.8),
(7, 'Interstellar',  'Sci-Fi',  2014, 8.6);
GO

-- 1. Название, жанр и рейтинг всех фильмов
SELECT Title, Genre, Rating FROM Movies;

-- 2. Уникальные жанры
SELECT DISTINCT Genre FROM Movies;

-- 3. Три фильма с самым высоким рейтингом (сначала сортируем!)
SELECT TOP 3 Title, Rating FROM Movies ORDER BY Rating DESC;

-- 4. Названия заглавными буквами
SELECT UPPER(Title) AS Title FROM Movies;

-- 5. Название и число символов в нём
SELECT Title, LEN(Title) AS TitleLength FROM Movies;
`,
      },
    ],
  },
  {
    lesson: 4,
    title: 'Урок 4 · WHERE и функции',
    items: [
      {
        id: 'l4-logic',
        title: 'WHERE: AND, OR, NOT',
        hint: 'WHERE · AND · OR · NOT',
        needs: 'l3-select',
        sql: `USE SchoolDB;
GO

-- WHERE оставляет только строки, подходящие под условие.
SELECT * FROM Students WHERE City = 'New York';

-- AND — должны выполняться оба условия
SELECT * FROM Students WHERE Age = 14 AND City = 'Chicago';

-- OR — достаточно одного
SELECT * FROM Students WHERE City = 'Boston' OR Grade > 9;

-- NOT — наоборот: все, кто НЕ из Chicago
SELECT * FROM Students WHERE NOT City = 'Chicago';

-- Вопрос со слайда: исключить сразу два значения
SELECT * FROM Students WHERE NOT City = 'Chicago' AND NOT City = 'Boston';
`,
      },
      {
        id: 'l4-compare',
        title: 'Операторы сравнения',
        hint: '= · <> · > · < · >= · <=',
        needs: 'l3-select',
        sql: `USE SchoolDB;
GO

SELECT * FROM Students WHERE LastName = 'Smith';   -- равно
SELECT * FROM Students WHERE FirstName <> 'Bob';   -- не равно (можно и !=)
SELECT * FROM Students WHERE StudentID > 3;        -- больше
SELECT * FROM Students WHERE StudentID < 3;        -- меньше
SELECT * FROM Students WHERE StudentID >= 4;       -- больше или равно
SELECT * FROM Students WHERE StudentID <= 4;       -- меньше или равно

-- Задание 1: Grade > 8, StudentID <= 4 и фамилия не Smith
SELECT * FROM Students
WHERE Grade > 8 AND StudentID <= 4 AND LastName <> 'Smith';

-- Задание 2: StudentID от 2 до 4 и (Grade = 10 или Grade < 8)
SELECT * FROM Students
WHERE StudentID >= 2 AND StudentID < 5 AND (Grade = 10 OR Grade < 8);
`,
      },
      {
        id: 'l4-null-in-between',
        title: 'IS NULL, IN, BETWEEN',
        hint: 'IS NOT NULL · IN (…) · BETWEEN … AND …',
        needs: 'l3-select',
        sql: `USE SchoolDB;
GO

-- IS NOT NULL — у кого есть оценка. Сравнение «= NULL» не работает!
SELECT FirstName, LastName FROM Students
WHERE Grade IS NOT NULL AND City = 'New York';

SELECT FirstName FROM Students WHERE Grade IS NULL;

-- IN — значение из списка (короче, чем много OR)
SELECT LastName FROM Students
WHERE City IN ('Boston', 'New York', 'Chicago');

-- BETWEEN — диапазон, границы включаются
SELECT * FROM Students WHERE Grade BETWEEN 8 AND 9.5;
`,
      },
      {
        id: 'l4-like',
        title: 'LIKE: %, _, [ ] и [^ ]',
        hint: "LIKE 'A%' · '_o%' · '[A-C]%' · '[^A]%'",
        needs: 'l3-select',
        sql: `USE SchoolDB;
GO

-- %  — любое число любых символов
SELECT FirstName FROM Students WHERE FirstName LIKE 'A%';    -- начинается на A
SELECT LastName  FROM Students WHERE LastName  LIKE '%er';   -- заканчивается на er
SELECT LastName  FROM Students WHERE LastName  LIKE '%i%';   -- содержит i

-- _  — ровно один любой символ
SELECT FirstName FROM Students WHERE FirstName LIKE 'A____'; -- 5 букв, начинается на A
SELECT FirstName FROM Students WHERE FirstName LIKE '_o%';   -- вторая буква o

-- [ ] — один символ из набора или диапазона (только SQL Server)
SELECT FirstName FROM Students WHERE FirstName LIKE '[AB]%';  -- на A или B
SELECT FirstName FROM Students WHERE FirstName LIKE '[A-C]%'; -- от A до C

-- [^ ] — один символ НЕ из набора
SELECT FirstName FROM Students WHERE FirstName LIKE '[^A]%';  -- не на A
SELECT FirstName FROM Students WHERE FirstName LIKE '[^AB]%'; -- не на A и не на B

-- Сравнение строк в SQL Server не зависит от регистра:
SELECT FirstName FROM Students WHERE FirstName LIKE 'alice';
`,
      },
      {
        id: 'l4-cars',
        title: 'Таблица CarRentalss (40 строк)',
        hint: 'большая таблица для упражнений',
        sql: `${SCHOOL}
DROP TABLE IF EXISTS CarRentalss;

CREATE TABLE CarRentalss (
    RentalID       INT PRIMARY KEY,
    CustomerName   VARCHAR(100),
    CarBrand       VARCHAR(50),
    CarModel       VARCHAR(50),
    CarType        VARCHAR(20),
    FuelType       VARCHAR(20),
    Transmission   VARCHAR(20),
    RentalDate     DATE,
    ReturnDate     DATE,
    RentalDays     INT,
    DailyRate      DECIMAL(7, 2),
    TotalCost      DECIMAL(10, 2),
    Rating         INT,
    OfficeLocation VARCHAR(100)
);

INSERT INTO CarRentalss (
    RentalID, CustomerName, CarBrand, CarModel, CarType, FuelType,
    Transmission, RentalDate, ReturnDate, RentalDays, DailyRate,
    TotalCost, Rating, OfficeLocation
)
VALUES
(1, 'Emma Lee', 'BMW', 'X5', 'Sedan', 'Hybrid', 'Manual', '2025-07-18', '2025-07-28', 10, 48.30, 483.00, 5, 'Houston'),
(2, 'Olivia Clark', 'Tesla', 'Model 3', 'Pickup', 'Diesel', 'Automatic', '2025-06-08', '2025-06-10', 2, 97.13, 194.26, 3, 'New York'),
(3, 'Alice Johnson', 'Tesla', 'Model 3', 'Sedan', 'Diesel', 'Automatic', '2025-05-20', '2025-05-22', 2, 45.61, 91.22, 5, 'Boston'),
(4, 'Olivia Clark', 'Chevrolet', 'Malibu', 'Hatchback', 'Diesel', 'Automatic', '2025-07-24', '2025-07-26', 2, 72.62, 145.24, 3, 'New York'),
(5, 'Alice Johnson', 'Hyundai', 'Elantra', 'Convertible', 'Diesel', 'Manual', '2025-05-18', '2025-05-29', 11, 119.11, 1310.21, 1, 'Denver'),
(6, 'Laura Baker', 'Kia', 'Sportage', 'Convertible', 'Hybrid', 'Manual', '2025-05-28', '2025-05-31', 3, 55.34, 166.02, 3, 'Miami'),
(7, 'Noah Brown', 'Honda', 'Civic', 'Hatchback', 'Electric', 'Manual', '2025-07-14', '2025-07-23', 9, 114.74, 1032.66, 4, 'Seattle'),
(8, 'Laura Baker', 'Hyundai', 'Elantra', 'Pickup', 'Hybrid', 'Manual', '2025-07-01', '2025-07-05', 4, 39.51, 158.04, 1, 'San Diego'),
(9, 'Emma Lee', 'Chevrolet', 'Malibu', 'Sedan', 'Electric', 'Automatic', '2025-06-19', '2025-06-27', 8, 70.56, 564.48, 2, 'San Diego'),
(10, 'Maria Gomez', 'Toyota', 'Corolla', 'SUV', 'Electric', 'Manual', '2025-06-14', '2025-06-22', 8, 88.92, 711.36, 3, 'Chicago'),
(11, 'Liam Davis', 'Ford', 'Explorer', 'SUV', 'Gasoline', 'Automatic', '2025-07-03', '2025-07-10', 7, 65.50, 458.50, 4, 'Los Angeles'),
(12, 'Maria Gomez', 'Audi', 'A4', 'Sedan', 'Diesel', 'Manual', '2025-06-12', '2025-06-18', 6, 82.00, 492.00, 5, 'New York'),
(13, 'Jake Turner', 'BMW', 'X5', 'Convertible', 'Hybrid', 'Automatic', '2025-05-22', '2025-05-26', 4, 110.75, 443.00, 3, 'San Francisco'),
(14, 'Bob Smith', 'Kia', 'Sportage', 'Hatchback', 'Gasoline', 'Manual', '2025-06-30', '2025-07-02', 2, 49.99, 99.98, 2, 'Chicago'),
(15, 'Olivia Clark', 'Ford', 'Explorer', 'Sedan', 'Hybrid', 'Automatic', '2025-06-11', '2025-06-14', 3, 61.00, 183.00, 4, 'Miami'),
(16, 'Emma Lee', 'Hyundai', 'Elantra', 'Pickup', 'Diesel', 'Manual', '2025-07-01', '2025-07-10', 9, 73.40, 660.60, 3, 'Denver'),
(17, 'Bob Smith', 'Honda', 'Civic', 'SUV', 'Electric', 'Automatic', '2025-06-15', '2025-06-20', 5, 99.90, 499.50, 5, 'Los Angeles'),
(18, 'Liam Davis', 'Toyota', 'Corolla', 'Hatchback', 'Gasoline', 'Manual', '2025-07-02', '2025-07-09', 7, 46.80, 327.60, 2, 'Boston'),
(19, 'Jake Turner', 'Tesla', 'Model 3', 'Sedan', 'Electric', 'Automatic', '2025-07-08', '2025-07-11', 3, 85.00, 255.00, 5, 'San Francisco'),
(20, 'Maria Gomez', 'Audi', 'A4', 'SUV', 'Diesel', 'Manual', '2025-06-05', '2025-06-10', 5, 76.25, 381.25, 3, 'Seattle'),
(21, 'Alice Johnson', 'Kia', 'Sportage', 'Convertible', 'Gasoline', 'Automatic', '2025-05-12', '2025-05-17', 5, 58.00, 290.00, 4, 'Houston'),
(22, 'Emma Lee', 'Chevrolet', 'Malibu', 'SUV', 'Hybrid', 'Manual', '2025-06-04', '2025-06-08', 4, 69.00, 276.00, 2, 'Miami'),
(23, 'Noah Brown', 'Hyundai', 'Elantra', 'Sedan', 'Diesel', 'Automatic', '2025-05-09', '2025-05-13', 4, 64.00, 256.00, 4, 'Chicago'),
(24, 'Jake Turner', 'BMW', 'X5', 'Hatchback', 'Hybrid', 'Manual', '2025-07-15', '2025-07-20', 5, 115.00, 575.00, 5, 'San Diego'),
(25, 'Laura Baker', 'Nissan', 'Altima', 'Sedan', 'Gasoline', 'Automatic', '2025-07-04', '2025-07-10', 6, 60.00, 360.00, 3, 'Seattle'),
(26, 'Olivia Clark', 'Audi', 'A4', 'Pickup', 'Electric', 'Manual', '2025-06-02', '2025-06-07', 5, 72.75, 363.75, 4, 'Denver'),
(27, 'Bob Smith', 'Ford', 'Explorer', 'SUV', 'Diesel', 'Automatic', '2025-05-01', '2025-05-06', 5, 67.50, 337.50, 2, 'New York'),
(28, 'Emma Lee', 'Hyundai', 'Elantra', 'Hatchback', 'Gasoline', 'Manual', '2025-07-11', '2025-07-15', 4, 59.25, 237.00, 4, 'Los Angeles'),
(29, 'Maria Gomez', 'Kia', 'Sportage', 'Sedan', 'Hybrid', 'Automatic', '2025-05-14', '2025-05-19', 5, 63.00, 315.00, 3, 'Boston'),
(30, 'Liam Davis', 'Honda', 'Civic', 'SUV', 'Electric', 'Automatic', '2025-06-21', '2025-06-28', 7, 88.00, 616.00, 5, 'San Francisco'),
(31, 'Alice Johnson', 'Toyota', 'Corolla', 'Convertible', 'Gasoline', 'Manual', '2025-05-25', '2025-05-29', 4, 53.50, 214.00, 2, 'Miami'),
(32, 'Jake Turner', 'Tesla', 'Model 3', 'Hatchback', 'Electric', 'Automatic', '2025-07-20', '2025-07-25', 5, 91.00, 455.00, 5, 'Seattle'),
(33, 'Laura Baker', 'Chevrolet', 'Malibu', 'Pickup', 'Diesel', 'Manual', '2025-06-18', '2025-06-22', 4, 68.40, 273.60, 3, 'Houston'),
(34, 'Noah Brown', 'BMW', 'X5', 'SUV', 'Hybrid', 'Automatic', '2025-05-30', '2025-06-04', 5, 105.00, 525.00, 4, 'Chicago'),
(35, 'Maria Gomez', 'Hyundai', 'Elantra', 'Sedan', 'Gasoline', 'Manual', '2025-07-16', '2025-07-20', 4, 47.75, 191.00, 2, 'Los Angeles'),
(36, 'Liam Davis', 'Audi', 'A4', 'Convertible', 'Diesel', 'Automatic', '2025-06-07', '2025-06-10', 3, 78.00, 234.00, 4, 'New York'),
(37, 'Emma Lee', 'Ford', 'Explorer', 'Hatchback', 'Gasoline', 'Manual', '2025-06-25', '2025-06-28', 3, 66.00, 198.00, 3, 'Miami'),
(38, 'Jake Turner', 'Nissan', 'Altima', 'SUV', 'Diesel', 'Automatic', '2025-05-11', '2025-05-16', 5, 71.00, 355.00, 5, 'San Diego'),
(39, 'Alice Johnson', 'Kia', 'Sportage', 'Pickup', 'Electric', 'Manual', '2025-07-13', '2025-07-19', 6, 77.50, 465.00, 4, 'Denver'),
(40, 'Olivia Clark', 'Tesla', 'Model 3', 'Sedan', 'Electric', 'Automatic', '2025-06-09', '2025-06-15', 6, 86.25, 517.50, 5, 'San Francisco');
GO

SELECT * FROM CarRentalss;

-- Попрактикуйся с WHERE на большой таблице:
SELECT CustomerName, CarBrand, TotalCost
FROM CarRentalss
WHERE FuelType = 'Electric' AND Rating >= 4;
`,
      },
      {
        id: 'l4-dates',
        title: 'CAST, GETDATE, DATEADD, DATEDIFF',
        hint: 'преобразование типов и функции дат',
        needs: 'l4-cars',
        sql: `USE SchoolDB;
GO

-- CAST — меняет тип: DailyRate (DECIMAL) → текст VARCHAR
SELECT CarModel, CAST(DailyRate AS VARCHAR(10)) AS DailyRateText
FROM CarRentalss;

-- Текст → число и число → целое
SELECT CAST('125' AS INT) + 5 AS TextToInt,
       CAST(48.79 AS INT)     AS DecimalToInt;

-- GETDATE — текущие дата и время сервера
SELECT GETDATE() AS Now;

-- Аренды, которые уже закончились (ReturnDate раньше сегодняшнего дня)
SELECT *
FROM CarRentalss
WHERE ReturnDate < GETDATE();

-- DATEADD — прибавляет интервал к дате
SELECT '2025-08-01' AS StartDate,
       DATEADD(DAY, 5, '2025-08-01') AS PredictedReturnDate;

SELECT RentalID, RentalDate,
       DATEADD(WEEK, 1, RentalDate)  AS PlusWeek,
       DATEADD(MONTH, 1, RentalDate) AS PlusMonth
FROM CarRentalss
WHERE RentalID <= 5;

-- DATEDIFF — сколько дней прошло между двумя датами
SELECT CustomerName, RentalDate, ReturnDate,
       DATEDIFF(DAY, RentalDate, ReturnDate) AS RentalDurationDays
FROM CarRentalss;

-- Совпадает ли посчитанное число дней с колонкой RentalDays?
SELECT RentalID, RentalDays, DATEDIFF(DAY, RentalDate, ReturnDate) AS Calculated
FROM CarRentalss
WHERE RentalDays <> DATEDIFF(DAY, RentalDate, ReturnDate);
`,
      },
    ],
  },
]

/** Плоский список всех примеров. */
export const ALL_EXAMPLES = LESSONS.flatMap(l => l.items.map(i => ({ ...i, lesson: l.lesson })))
export const findExample = id => ALL_EXAMPLES.find(e => e.id === id) || null
