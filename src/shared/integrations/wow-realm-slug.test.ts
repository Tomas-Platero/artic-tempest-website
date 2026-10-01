import { describe, expect, it } from 'vitest';
import {
  toBlizzardCharacterName,
  toBlizzardRealmSlug,
  toRaiderIoRealmSlug,
} from './wow-realm-slug';

// Expected values match the live-API measurements recorded in ATW-44
// (data/wow/realm/index EU slugs and character/profile responses).
describe('toBlizzardRealmSlug', () => {
  it('maps measured EU realm names to canonical slugs', () => {
    expect(toBlizzardRealmSlug("Zul'jin")).toBe('zuljin');
    expect(toBlizzardRealmSlug("C'Thun")).toBe('cthun');
    expect(toBlizzardRealmSlug("Quel'Thalas")).toBe('quelthalas');
    expect(toBlizzardRealmSlug("Kel'Thuzad")).toBe('kelthuzad');
    expect(toBlizzardRealmSlug("Mal'Ganis")).toBe('malganis');
    expect(toBlizzardRealmSlug("Kil'jaeden")).toBe('kiljaeden');
    expect(toBlizzardRealmSlug("Pozzo dell'Eternità")).toBe(
      'pozzo-delleternità',
    );
    expect(toBlizzardRealmSlug('Dun Modr')).toBe('dun-modr');
  });

  it('removes every apostrophe-like code point without inserting a dash', () => {
    expect(toBlizzardRealmSlug('Kil\u2019jaeden')).toBe('kiljaeden');
    expect(toBlizzardRealmSlug('Kil\u2018jaeden')).toBe('kiljaeden');
    expect(toBlizzardRealmSlug('Kil\u02BCjaeden')).toBe('kiljaeden');
    expect(toBlizzardRealmSlug('Kil`jaeden')).toBe('kiljaeden');
    expect(toBlizzardRealmSlug('Kil´jaeden')).toBe('kiljaeden');
  });

  it('collapses whitespace runs to a single dash and trims edges', () => {
    expect(toBlizzardRealmSlug('  Dun  Modr ')).toBe('dun-modr');
    expect(toBlizzardRealmSlug('\tTarren\t\tMill\n')).toBe('tarren-mill');
  });

  it('is idempotent on already-canonical slugs', () => {
    expect(toBlizzardRealmSlug('zuljin')).toBe('zuljin');
    expect(toBlizzardRealmSlug('pozzo-delleternità')).toBe(
      'pozzo-delleternità',
    );
    expect(toBlizzardRealmSlug('dun-modr')).toBe('dun-modr');
  });

  it('keeps diacritics', () => {
    expect(toBlizzardRealmSlug('pozzo-delleternita')).toBe(
      'pozzo-delleternita',
    );
  });

  it('is safe on names holding lone surrogates', () => {
    const malformed = '\uFFFD\uDC90oma';
    expect(() => toBlizzardRealmSlug(malformed)).not.toThrow();
    expect(toBlizzardRealmSlug(malformed)).toBe('oma');
  });
});

describe('toBlizzardCharacterName', () => {
  it('lowercases and trims while keeping diacritics', () => {
    expect(toBlizzardCharacterName('Wârlock')).toBe('wârlock');
    expect(toBlizzardCharacterName('Aiharä')).toBe('aiharä');
    expect(toBlizzardCharacterName('  Aiharä  ')).toBe('aiharä');
  });

  it('keeps apostrophes in character names', () => {
    expect(toBlizzardCharacterName("Nym'ora")).toBe("nym'ora");
  });

  it('drops lone surrogates without throwing', () => {
    const malformed = 'char\uDC90name';
    expect(() => toBlizzardCharacterName(malformed)).not.toThrow();
    expect(toBlizzardCharacterName(malformed)).toBe('charname');
  });
});

describe('toRaiderIoRealmSlug', () => {
  it('maps measured EU realm names to single-space slugs', () => {
    expect(toRaiderIoRealmSlug("Zul'jin")).toBe('zuljin');
    expect(toRaiderIoRealmSlug("C'Thun")).toBe('cthun');
    expect(toRaiderIoRealmSlug("Pozzo dell'Eternità")).toBe(
      'pozzo delleternità',
    );
    expect(toRaiderIoRealmSlug('Dun Modr')).toBe('dun modr');
  });

  it('keeps single spaces instead of dashes', () => {
    expect(toRaiderIoRealmSlug('Tarren Mill')).toBe('tarren mill');
    expect(toRaiderIoRealmSlug("Lightning's Blade")).toBe('lightnings blade');
  });

  it('collapses whitespace runs to a single space and trims edges', () => {
    expect(toRaiderIoRealmSlug('  Colinas   Pardas ')).toBe('colinas pardas');
  });

  it('is idempotent and safe on malformed input', () => {
    expect(toRaiderIoRealmSlug('zuljin')).toBe('zuljin');
    expect(toRaiderIoRealmSlug('pozzo delleternità')).toBe(
      'pozzo delleternità',
    );
    const malformed = '\uFFFD\uDC90oma';
    expect(() => toRaiderIoRealmSlug(malformed)).not.toThrow();
    expect(toRaiderIoRealmSlug(malformed)).toBe('oma');
  });
});
