import { describe, expect, it } from 'vitest';
import { resolveMembershipGate } from './discord-membership';

const base = {
  isTest: false,
  simulate: false,
  internalAdmin: false,
  hasDiscordAccount: true,
  inGuild: true,
};

describe('resolveMembershipGate', () => {
  it('allows an applicant who is in the server', () => {
    expect(resolveMembershipGate(base)).toEqual({
      allowed: true,
      reason: 'member',
    });
  });

  it('blocks an applicant who is not in the server', () => {
    expect(resolveMembershipGate({ ...base, inGuild: false })).toEqual({
      allowed: false,
      reason: 'not_in_server',
    });
  });

  it('blocks an applicant with no linked Discord account', () => {
    expect(
      resolveMembershipGate({
        ...base,
        hasDiscordAccount: false,
        inGuild: null,
      }),
    ).toEqual({ allowed: false, reason: 'no_discord_account' });
  });

  it('fails open when Discord could not be asked', () => {
    // A Discord outage must not make the application form unusable.
    expect(resolveMembershipGate({ ...base, inGuild: null })).toEqual({
      allowed: true,
      reason: 'unknown',
    });
  });

  it('fails open when the account itself could not be checked', () => {
    expect(
      resolveMembershipGate({
        ...base,
        hasDiscordAccount: null,
        inGuild: null,
      }),
    ).toEqual({ allowed: true, reason: 'unknown' });
  });

  it('exempts test runs even when the applicant is unreachable', () => {
    // The daily Statuspage self-test submits from the test character's owner,
    // who is not necessarily in the server. Blocking it would take the
    // monitoring down with it.
    expect(
      resolveMembershipGate({
        ...base,
        isTest: true,
        hasDiscordAccount: false,
        inGuild: false,
      }),
    ).toEqual({ allowed: true, reason: 'exempt_test' });
  });

  it('exempts an admin simulation', () => {
    expect(
      resolveMembershipGate({
        ...base,
        simulate: true,
        internalAdmin: true,
        inGuild: false,
      }),
    ).toEqual({ allowed: true, reason: 'exempt_simulate' });
  });

  it('does not exempt a plain user who passes ?simulate=true', () => {
    // `simulate` alone is not a bypass: it only counts with the admin permission.
    expect(
      resolveMembershipGate({
        ...base,
        simulate: true,
        internalAdmin: false,
        inGuild: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_in_server' });
  });

  it('checks a definite negative before the unknown cases', () => {
    // `inGuild: false` is a real answer, so it must block even though the account
    // flag is unknown.
    expect(
      resolveMembershipGate({
        ...base,
        hasDiscordAccount: null,
        inGuild: false,
      }),
    ).toEqual({ allowed: false, reason: 'not_in_server' });
  });
});
