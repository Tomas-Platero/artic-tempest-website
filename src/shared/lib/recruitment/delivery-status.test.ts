import { describe, expect, it } from 'vitest';
import {
  describeDelivery,
  describeDeliveryError,
  describeReachability,
  type RecruitmentDelivery,
} from './delivery-status';

function makeDelivery(
  overrides: Partial<RecruitmentDelivery> = {},
): RecruitmentDelivery {
  return {
    id: 'd1',
    application_id: 'a1',
    message_id: 'm1',
    event_id: 'e1',
    kind: 'chat_message',
    recipient_kind: 'applicant',
    recipient_discord_id: '123',
    recipient_in_guild: true,
    status: 'queued',
    attempts: 0,
    discord_message_id: null,
    error_code: null,
    error_message: null,
    created_at: '2026-10-03T06:00:00.000Z',
    updated_at: '2026-10-03T06:00:00.000Z',
    delivered_at: null,
    ...overrides,
  };
}

describe('describeDelivery', () => {
  it('reports a missing record as unknown rather than as delivered', () => {
    expect(describeDelivery(null)).toEqual({
      status: 'unknown',
      label: 'Sin registro',
      detail: 'No hay datos de entrega para este mensaje',
      tone: 'neutral',
    });
  });

  it('reports a confirmed delivery', () => {
    const result = describeDelivery(makeDelivery({ status: 'sent' }));
    expect(result.label).toBe('Enviado');
    expect(result.tone).toBe('success');
  });

  it('keeps queued distinct from sent, because the bot has not confirmed', () => {
    const result = describeDelivery(makeDelivery({ status: 'queued' }));
    expect(result.status).toBe('queued');
    expect(result.label).toBe('Sin confirmar');
    expect(result.tone).toBe('warning');
  });

  it('explains a 50007 failure in terms of the applicant', () => {
    const result = describeDelivery(
      makeDelivery({ status: 'failed', error_code: '50007' }),
    );
    expect(result.label).toBe('No enviado');
    expect(result.detail).toBe('El aplicante no acepta mensajes directos');
    expect(result.tone).toBe('danger');
  });

  it('falls back to the raw Discord message for unknown error codes', () => {
    const result = describeDelivery(
      makeDelivery({
        status: 'failed',
        error_code: '40001',
        error_message: 'Unauthorized',
      }),
    );
    expect(result.detail).toBe('Unauthorized');
  });

  it('marks an applicant without Discord as not notified', () => {
    const result = describeDelivery(
      makeDelivery({ status: 'skipped_no_discord' }),
    );
    expect(result.label).toBe('Sin aviso');
    expect(result.detail).toBe('El aplicante no tiene Discord vinculado');
  });
});

describe('describeDeliveryError', () => {
  it('maps the known Discord codes', () => {
    expect(describeDeliveryError('10007')).toBe(
      'El aplicante no está en el servidor',
    );
    expect(describeDeliveryError('event_publish_failed')).toBe(
      'No se pudo encolar el aviso',
    );
  });

  it('never returns an inherited member for a dynamic key', () => {
    // Indexing an object literal with an arbitrary key can reach Object.prototype.
    const result = describeDeliveryError('constructor');
    expect(typeof result).toBe('string');
    expect(result).toBe('Error de Discord (constructor)');
  });

  it('falls back to a generic message when nothing is known', () => {
    expect(describeDeliveryError(null, null)).toBe(
      'No se pudo entregar el aviso',
    );
  });
});

describe('describeReachability', () => {
  it('flags an applicant with no Discord account', () => {
    const result = describeReachability({ hasDiscord: false, inGuild: null });
    expect(result.reachable).toBe(false);
    expect(result.tone).toBe('danger');
  });

  it('confirms an applicant who is in the server', () => {
    const result = describeReachability({ hasDiscord: true, inGuild: true });
    expect(result.reachable).toBe(true);
    expect(result.label).toBe('Alcanzable');
  });

  it('explains why an applicant outside the server cannot be reached', () => {
    const result = describeReachability({ hasDiscord: true, inGuild: false });
    expect(result.reachable).toBe(false);
    expect(result.label).toBe('No alcanzable');
    expect(result.detail).toContain('No está en el servidor');
  });

  it('treats a failed lookup as unknown, not as absent', () => {
    const result = describeReachability({ hasDiscord: true, inGuild: null });
    expect(result.reachable).toBeNull();
    expect(result.label).toBe('Sin comprobar');
  });
});
