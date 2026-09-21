-- Example inserts for the "lifetracker" PostgreSQL database (localhost:5000). Run in pgAdmin or psql.
--
-- PostgreSQL is case-sensitive about names: table names and camelCase columns must be in "double quotes".
-- Every row needs a "userId": 3 = karthik. "id", "createdAt" and "updatedAt" fill in automatically.
-- Dates: use 'YYYY-MM-DD' (the app treats them as calendar days).

-- To-do  (priority: 'LOW' | 'MEDIUM' | 'HIGH', done: true or false)
INSERT INTO "Todo" ("userId", title, priority, "dueDate")
VALUES (3, 'Buy groceries', 'HIGH', '2026-09-25');

-- Money  (type: 'INCOME' | 'EXPENSE', amount is a positive number)
INSERT INTO "Transaction" ("userId", type, amount, category, note, date)
VALUES (3, 'INCOME',  50000, 'Salary', NULL,    '2026-09-01'),
       (3, 'EXPENSE',   250, 'Food',   'Lunch', '2026-09-21'),
       (3, 'EXPENSE',  8000, 'Rent',   NULL,    '2026-09-02');

-- Gym: a workout and its exercises in one statement (the new workout's id is picked up automatically)
WITH w AS (
  INSERT INTO "Workout" ("userId", date, title, "durationMin") VALUES (3, '2026-09-21', 'Push day', 60) RETURNING id
)
INSERT INTO "WorkoutExercise" ("workoutId", name, sets, reps, "weightKg")
SELECT id, 'Bench press', 3, 8, 60 FROM w
UNION ALL
SELECT id, 'Shoulder press', 3, 10, 30 FROM w;

-- Rounds (the Rounds tab; the table is called "Run")
INSERT INTO "Run" ("userId", date, rounds, "durationMin") VALUES (3, '2026-09-21', 5, 30);

-- Body weight
INSERT INTO "BodyMetric" ("userId", date, "weightKg") VALUES (3, '2026-09-21', 72.5);

-- Challenge, then one check-in row per day you did it
WITH c AS (
  INSERT INTO "Challenge" ("userId", title, "startDate", "targetDays") VALUES (3, '30 days no sugar', '2026-09-20', 30) RETURNING id
)
INSERT INTO "ChallengeCheckin" ("challengeId", date)
SELECT c.id, d::timestamp FROM c, (VALUES ('2026-09-20'), ('2026-09-21')) AS days(d);

-- Food log  (meal: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK', place: 'HOME' | 'OUTSIDE', calories in kcal - optional)
INSERT INTO "FoodEntry" ("userId", date, meal, place, name, calories, note)
VALUES (3, '2026-09-21', 'BREAKFAST', 'HOME',    'Idli & sambar',   350, NULL),
       (3, '2026-09-21', 'LUNCH',     'OUTSIDE', 'Chicken biryani', 650, 'with office team'),
       (3, '2026-09-21', 'SNACK',     'OUTSIDE', 'Samosa',           250, NULL);

-- Daily calorie goal (kcal, 500-10000; NULL = not set). This is a column on your "User" row.
UPDATE "User" SET "calorieGoal" = 2000 WHERE id = 3;

-- Books  (status: 'READING' | 'FINISHED' | 'WANT'; rating 1-5 only for FINISHED; moral = the lesson you took from it)
INSERT INTO "Book" ("userId", title, author, status, "totalPages", "currentPage", rating, moral, "startedOn", "finishedOn")
VALUES (3, 'Atomic Habits', 'James Clear',  'FINISHED', 320, 320, 5,    'Get 1% better every day - small habits compound.', '2026-09-01', '2026-09-20'),
       (3, 'Deep Work',     'Cal Newport',  'READING',  300, 120, NULL, NULL, '2026-09-21', NULL),
       (3, 'The Alchemist', 'Paulo Coelho', 'WANT',     NULL, NULL, NULL, NULL, NULL, NULL);

-- Diary  (one entry per day; mood: 'GREAT' | 'GOOD' | 'OKAY' | 'LOW' | 'BAD')
INSERT INTO "DiaryEntry" ("userId", date, title, content, mood)
VALUES (3, '2026-09-21', 'A good day', 'Went for a run, cooked at home, and finished a chapter.', 'GOOD');

-- Career: study log (one row per topic you studied; "notes" = what you learned)
INSERT INTO "StudySession" ("userId", date, topic, subject, minutes, notes)
VALUES (3, '2026-09-21', 'React hooks', 'Frontend', 45, 'useEffect cleanup and dependency arrays'),
       (3, '2026-09-21', 'SQL joins',   'Data',     30, NULL);

-- Career tasks: "dueDate" is the day it has to be finished by (today, the end of this week/month, or any date)
INSERT INTO "CareerTask" ("userId", title, subject, "dueDate")
VALUES (3, 'Finish React course module 4', 'Frontend', '2026-09-25'),
       (3, 'Build the portfolio landing page', NULL,    '2026-09-30');

-- Daily study goal in minutes (10-1440; NULL = not set)
UPDATE "User" SET "studyGoalMin" = 120 WHERE id = 3;

-- Profile: phone number and picture on your "User" row ("avatar" is NULL for initials, 'preset:mask' | 'preset:amazing-mask' |
-- 'preset:spider' | 'preset:web' for a built-in picture, or an uploaded photo as a small data: URL)
UPDATE "User" SET phone = '+91 98765 43210', avatar = 'preset:mask' WHERE id = 3;

-- Character: the good qualities you are working on ("why" = what it looks like for you)
INSERT INTO "CharacterTrait" ("userId", name, emoji, why)
VALUES (3, 'Patience',   '🧘', 'Stay calm when things are slow or go wrong'),
       (3, 'Discipline', '🎯', 'Do what I said I would do');

-- Character: one row per quality per day you practised it (a quality can only be ticked once a day)
INSERT INTO "CharacterLog" ("userId", "traitId", date, note)
SELECT 3, id, '2026-09-21', 'Did not snap when the bus was late' FROM "CharacterTrait" WHERE "userId" = 3 AND name = 'Patience';

-- Character: your reflection for the day (rating 1-5; one per day)
INSERT INTO "CharacterReflection" ("userId", date, wins, improve, rating)
VALUES (3, '2026-09-21', 'Helped a friend with his project and stayed calm all day.', 'Pause before I react', 4);
