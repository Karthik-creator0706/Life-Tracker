// Pure helpers for the Profile page (no React / browser APIs), so they can be tested on their own.

/** Built-in profile pictures (original artwork, drawn in components/Avatar.tsx). */
export const PRESETS = [
  { id: 'mask', label: 'Classic mask' },
  { id: 'amazing-mask', label: 'Amazing mask' },
  { id: 'spider', label: 'Spider emblem' },
  { id: 'web', label: 'Web & spider' },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];

/** "preset:mask" -> "mask" (only for the built-in pictures we know about); anything else -> null. */
export function presetOf(avatar: string | null | undefined): PresetId | null {
  if (!avatar?.startsWith('preset:')) return null;
  const id = avatar.slice('preset:'.length);
  return PRESETS.some((p) => p.id === id) ? (id as PresetId) : null;
}

export const isUploaded = (avatar: string | null | undefined) => !!avatar && avatar.startsWith('data:image/');

/** Up to two capital letters from a name: "Karthik Kumar" -> "KK", "karthik" -> "K", "" -> "?". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w)[0].toUpperCase();
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

/**
 * The same rule the server applies: optional; digits with spaces, brackets, dots or dashes, an optional
 * leading +, and 7-15 digits in total.
 */
export function isValidPhone(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  const digits = v.replace(/[^0-9]/g, '').length;
  return v.length <= 24 && /^[+]?[0-9 ().-]+$/.test(v) && digits >= 7 && digits <= 15;
}

/** Picture uploads are cropped to a centred square and shrunk to this many pixels. */
export const PICTURE_SIZE = 256;

/** The largest centred square inside a w x h image. */
export function cropRect(w: number, h: number) {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}
