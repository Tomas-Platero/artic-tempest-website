// Shared slug/normalization helpers for World of Warcraft API providers.
//
// These rules were measured against the live APIs (2026), do not "simplify" them:
// - Blizzard realm slug: lowercase, apostrophes REMOVED (no dash in their place),
//   whitespace runs -> "-", diacritics KEPT (e.g. "Zul'jin" -> "zuljin",
//   "Pozzo dell'Eternità" -> "pozzo-delleternità").
// - Blizzard character name: lowercase + trim, diacritics and apostrophes KEPT
//   ("Wârlock" -> "wârlock"; the profile API 404s on "Warlock" or "Aihar").
// - Raider.IO realm: lowercase, apostrophes REMOVED, whitespace runs collapsed to
//   a SINGLE SPACE (spaces are preserved, NOT dashed), diacritics KEPT
//   ("Pozzo dell'Eternità" -> "pozzo delleternità").

/**
 * Defensive input sanitization.
 *
 * Some `bnet_characters` rows contain names with lone (unpaired) UTF-16
 * surrogates and/or U+FFFD replacement characters (e.g. "\uFFFD\uDC90oma").
 * Feeding those straight into `encodeURIComponent` throws a `URIError` at
 * request-build time. We strip unpaired surrogates and U+FFFD here instead of
 * relying on `String.prototype.toWellFormed`, which is not guaranteed to exist
 * on the Node version this app runs on.
 */
function stripUnpairedSurrogates(input: string): string {
  let result = '';
  // `for...of` iterates by code points: a valid surrogate pair is yielded as
  // one full code point (> 0xFFFF), a lone surrogate as a single code unit
  // (0xD800-0xDFFF range).
  for (const ch of input) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
    if (codePoint === 0xfffd) continue;
    result += ch;
  }
  return result;
}

// Apostrophe-like code points removed from realm slugs: U+0027 ', U+2018 ',
// U+2019 ', U+02BC ', U+0060 `, U+00B4 '.
const APOSTROPHE_LIKE = /[\u0027\u2018\u2019\u02bc\u0060\u00b4]/gu;

/**
 * Canonical Blizzard realm slug for API paths.
 * Idempotent: an already-canonical slug (e.g. "zuljin",
 * "pozzo-delleternità") is returned unchanged.
 */
export function toBlizzardRealmSlug(realm: string): string {
  return stripUnpairedSurrogates(realm)
    .trim()
    .toLowerCase()
    .replace(APOSTROPHE_LIKE, '')
    .replace(/\s+/g, '-');
}

/**
 * Canonical Blizzard character name for API paths.
 * Diacritics and apostrophes are KEPT: the profile API matches on the
 * accented, lowercased name.
 */
export function toBlizzardCharacterName(name: string): string {
  return stripUnpairedSurrogates(name).trim().toLowerCase();
}

/**
 * Canonical Raider.IO realm slug. Unlike Blizzard, whitespace is collapsed to
 * a single space (kept as a space, not dashed).
 */
export function toRaiderIoRealmSlug(realm: string): string {
  return stripUnpairedSurrogates(realm)
    .trim()
    .toLowerCase()
    .replace(APOSTROPHE_LIKE, '')
    .replace(/\s+/g, ' ');
}
