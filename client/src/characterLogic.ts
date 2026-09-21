// Levels, XP and starter ideas for the Character page (pure, so it can be tested on its own).
//
// Every day you practise a quality earns it 10 XP; writing a daily reflection earns 5 XP toward your overall character.
// Reaching level L needs 25 * L * (L - 1) XP in total: level 2 at 5 practice days, level 3 at 15, level 4 at 30,
// level 5 at 50, level 6 at 75, level 7 at 105 ... each level takes a little longer than the last.

export const XP_PER_PRACTICE = 10;
export const XP_PER_REFLECTION = 5;

export const LEVEL_TITLES = ['Newcomer', 'Apprentice', 'Practitioner', 'Adept', 'Expert', 'Master', 'Legend'];

/** Total XP needed to reach `level` (level 1 needs none). */
export const xpForLevel = (level: number) => 25 * level * (level - 1);

export interface LevelInfo {
  level: number;
  title: string;
  xpInto: number; // XP earned inside the current level
  xpNeeded: number; // XP the current level spans
  pct: number; // 0-100 through the current level
  toNext: number; // XP still missing for the next level
}

export function levelInfo(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  const xpInto = total - xpForLevel(level);
  const xpNeeded = xpForLevel(level + 1) - xpForLevel(level);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    xpInto,
    xpNeeded,
    pct: (xpInto / xpNeeded) * 100,
    toNext: xpNeeded - xpInto,
  };
}

export const traitXp = (daysPracticed: number) => daysPracticed * XP_PER_PRACTICE;
export const overallXp = (checkins: number, reflections: number) => checkins * XP_PER_PRACTICE + reflections * XP_PER_REFLECTION;

/** How many more practice days a quality needs to reach its next level. */
export const daysToNextLevel = (daysPracticed: number) => Math.ceil(levelInfo(traitXp(daysPracticed)).toNext / XP_PER_PRACTICE);

/** Did ticking one more day lift this quality to a new level? (used for the level-up message) */
export const levelsUpWithOneMoreDay = (daysPracticed: number) =>
  levelInfo(traitXp(daysPracticed + 1)).level > levelInfo(traitXp(daysPracticed)).level;

export interface Suggestion { name: string; emoji: string; why: string }

export const SUGGESTED_TRAITS: Suggestion[] = [
  { name: 'Discipline', emoji: '🎯', why: 'Do what I said I would do, even when I do not feel like it' },
  { name: 'Patience', emoji: '🧘', why: 'Stay calm when things are slow or go wrong' },
  { name: 'Kindness', emoji: '💛', why: 'Be warm and helpful to the people around me' },
  { name: 'Honesty', emoji: '🤝', why: 'Say what is true and keep my word' },
  { name: 'Confidence', emoji: '🦁', why: 'Speak up and back myself' },
  { name: 'Gratitude', emoji: '🙏', why: 'Notice and appreciate the good things' },
  { name: 'Courage', emoji: '🛡️', why: 'Do the right thing even when it is hard' },
  { name: 'Focus', emoji: '🔍', why: 'Give one thing my full attention' },
  { name: 'Responsibility', emoji: '🕷️', why: 'Own my choices and use my strengths to help' },
  { name: 'Resilience', emoji: '💪', why: 'Get back up and try again' },
  { name: 'Humility', emoji: '🌱', why: 'Keep learning and listen to others' },
  { name: 'Generosity', emoji: '🎁', why: 'Share my time, help and things' },
];

/** Starter ideas you have not added yet (compared ignoring case and spaces). */
export function suggestionsLeft(existingNames: string[]): Suggestion[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return SUGGESTED_TRAITS.filter((s) => !have.has(s.name.toLowerCase()));
}

export const EMOJI_CHOICES = ['⭐', '🎯', '🧘', '💛', '🤝', '🦁', '🙏', '🛡️', '🔍', '🕷️', '💪', '🌱', '🔥', '🧠', '🌟', '🎁'];

export const RATING_FACES = ['😞', '😕', '😐', '🙂', '🤩'];
export const RATING_LABELS = ['Not my best', 'Could be better', 'Okay', 'Good', 'My best self'];
