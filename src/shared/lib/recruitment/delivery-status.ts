/**
 * Delivery-state vocabulary for recruitment Discord notifications.
 *
 * This module is deliberately free of server imports: the chat and the interview
 * board are client components and need the labels and the status mapping.
 *
 * Why the states exist: `processed = true` on `recruitment_bot_events` only means
 * "the bot polled the row". The bot marks it that way even when the DM throws, so a
 * failed notification used to leave no trace anywhere. These states are what let us
 * say "delivered", "not delivered, and here is why" — and, when the bot never
 * reports back at all, "unconfirmed".
 */

export const DELIVERY_STATUSES = [
  'queued',
  'sent',
  'failed',
  'skipped_no_discord',
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_KINDS = [
  'chat_message',
  'status_changed',
  'applicant_reply',
  'application_created',
] as const;

export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

export type RecipientKind = 'applicant' | 'officer';

export type RecruitmentDelivery = {
  id: string;
  application_id: string;
  message_id: string | null;
  event_id: string | null;
  kind: DeliveryKind;
  recipient_kind: RecipientKind;
  recipient_discord_id: string | null;
  recipient_in_guild: boolean | null;
  status: DeliveryStatus;
  attempts: number;
  discord_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
};

export type DeliveryTone = 'success' | 'danger' | 'warning' | 'neutral';

export type DeliveryDescription = {
  status: DeliveryStatus | 'unknown';
  label: string;
  detail: string;
  tone: DeliveryTone;
};

/**
 * Discord error codes we know how to explain. 50007 is the one that matters in
 * practice: the applicant shares no guild with the bot, or has DMs from server
 * members switched off. There is no API that can bypass that.
 */
const DELIVERY_ERROR_DETAILS = {
  '50007': 'El aplicante no acepta mensajes directos',
  '10007': 'El aplicante no está en el servidor',
  '10013': 'Cuenta de Discord desconocida',
  event_publish_failed: 'No se pudo encolar el aviso',
} satisfies Record<string, string>;

export const DELIVERY_TONE_CLASSES = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  danger: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  neutral: 'border-white/10 bg-white/5 text-zinc-400',
} satisfies Record<DeliveryTone, string>;

/**
 * Own-enumerable lookup: indexing by a dynamic key can otherwise reach
 * `Object.prototype` members and hand back a function instead of a string.
 */
function findDeliveryErrorDetail(errorCode: string): string | undefined {
  for (const [code, detail] of Object.entries(DELIVERY_ERROR_DETAILS)) {
    if (code === errorCode) return detail;
  }
  return undefined;
}

export function describeDeliveryError(
  errorCode?: string | null,
  errorMessage?: string | null,
): string {
  if (errorCode) {
    const known = findDeliveryErrorDetail(errorCode);
    if (known) return known;
  }
  if (errorMessage) return errorMessage;
  if (errorCode) return `Error de Discord (${errorCode})`;
  return 'No se pudo entregar el aviso';
}

export function describeDelivery(
  delivery?: RecruitmentDelivery | null,
): DeliveryDescription {
  if (!delivery) {
    return {
      status: 'unknown',
      label: 'Sin registro',
      detail: 'No hay datos de entrega para este mensaje',
      tone: 'neutral',
    };
  }

  switch (delivery.status) {
    case 'sent':
      return {
        status: 'sent',
        label: 'Enviado',
        detail: 'Discord confirmó la entrega',
        tone: 'success',
      };
    case 'failed':
      return {
        status: 'failed',
        label: 'No enviado',
        detail: describeDeliveryError(
          delivery.error_code,
          delivery.error_message,
        ),
        tone: 'danger',
      };
    case 'skipped_no_discord':
      return {
        status: 'skipped_no_discord',
        label: 'Sin aviso',
        detail: 'El aplicante no tiene Discord vinculado',
        tone: 'neutral',
      };
    case 'queued':
    default:
      return {
        status: 'queued',
        label: 'Sin confirmar',
        detail: 'El bot todavía no ha confirmado la entrega',
        tone: 'warning',
      };
  }
}

/**
 * A `queued` row means the bot has not confirmed yet: it may be down, or the event
 * never reached it. It is reported as unconfirmed rather than as delivered.
 */
export type Reachability = {
  reachable: boolean | null;
  label: string;
  detail: string;
  tone: DeliveryTone;
};

/**
 * Whether the bot can be expected to reach this applicant at all. `inGuild` is
 * null when we could not ask Discord; that is reported as unknown rather than
 * assumed either way.
 */
export function describeReachability(input: {
  hasDiscord: boolean;
  inGuild: boolean | null;
}): Reachability {
  if (!input.hasDiscord) {
    return {
      reachable: false,
      label: 'Sin Discord',
      detail: 'No hay cuenta de Discord vinculada',
      tone: 'danger',
    };
  }
  if (input.inGuild === true) {
    return {
      reachable: true,
      label: 'Alcanzable',
      detail: 'Está en el servidor y puede recibir el aviso',
      tone: 'success',
    };
  }
  if (input.inGuild === false) {
    return {
      reachable: false,
      label: 'No alcanzable',
      detail:
        'No está en el servidor: sin servidor en común no se le puede avisar por DM',
      tone: 'danger',
    };
  }
  return {
    reachable: null,
    label: 'Sin comprobar',
    detail: 'No se pudo consultar su pertenencia al servidor',
    tone: 'neutral',
  };
}
