import 'server-only';

import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import type {
  DeliveryKind,
  DeliveryStatus,
  RecipientKind,
  RecruitmentDelivery,
} from '@/shared/lib/recruitment/delivery-status';

const TABLE = 'recruitment_discord_deliveries';

export type NewDelivery = {
  applicationId: string;
  kind: DeliveryKind;
  recipientKind: RecipientKind;
  status: DeliveryStatus;
  messageId?: string | null;
  recipientDiscordId?: string | null;
  recipientInGuild?: boolean | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

/**
 * Records the intended delivery. Returns null (and logs) when the row cannot be
 * created, so the caller can surface "sin registro" instead of claiming success.
 */
export async function createDelivery(
  input: NewDelivery,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      application_id: input.applicationId,
      message_id: input.messageId ?? null,
      kind: input.kind,
      recipient_kind: input.recipientKind,
      recipient_discord_id: input.recipientDiscordId ?? null,
      recipient_in_guild: input.recipientInGuild ?? null,
      status: input.status,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to create delivery row:',
      error.message,
    );
    return null;
  }

  return data?.id ?? null;
}

export async function attachDeliveryEvent(
  deliveryId: string,
  eventId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({ event_id: eventId, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to link event:',
      error.message,
    );
  }
}

export async function failDelivery(
  deliveryId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to mark delivery as failed:',
      error.message,
    );
  }
}

export async function getDeliveryById(
  deliveryId: string,
): Promise<RecruitmentDelivery | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('id', deliveryId)
    .maybeSingle();

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to load delivery:',
      error.message,
    );
    return null;
  }

  return (data as RecruitmentDelivery) ?? null;
}

export async function getDeliveryByEventId(
  eventId: string,
): Promise<RecruitmentDelivery | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to load delivery by event:',
      error.message,
    );
    return null;
  }

  return (data as RecruitmentDelivery) ?? null;
}

/**
 * Applies the outcome the bot reported. Returns `matched: false` when no delivery
 * row is linked to that event, which is normal for event kinds this app does not
 * track and must not be treated as an error by the caller.
 */
export async function recordDeliveryReport(input: {
  eventId: string;
  status: Extract<DeliveryStatus, 'sent' | 'failed'>;
  discordMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<{ matched: boolean }> {
  const delivery = await getDeliveryByEventId(input.eventId);
  if (!delivery) return { matched: false };

  const now = new Date().toISOString();
  const patch =
    input.status === 'sent'
      ? {
          status: 'sent' as const,
          discord_message_id: input.discordMessageId ?? null,
          delivered_at: now,
          error_code: null,
          error_message: null,
          updated_at: now,
        }
      : {
          status: 'failed' as const,
          discord_message_id: null,
          delivered_at: null,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          updated_at: now,
        };

  const { error } = await supabaseAdmin
    .from(TABLE)
    .update(patch)
    .eq('id', delivery.id);

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to record delivery report:',
      error.message,
    );
    return { matched: false };
  }

  return { matched: true };
}

/** Delivery state per message, for the chat badges. */
export async function getDeliveriesByMessageIds(
  messageIds: string[],
): Promise<Map<string, RecruitmentDelivery>> {
  const byMessageId = new Map<string, RecruitmentDelivery>();
  if (messageIds.length === 0) return byMessageId;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .in('message_id', messageIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to load deliveries:',
      error.message,
    );
    return byMessageId;
  }

  for (const row of (data ?? []) as RecruitmentDelivery[]) {
    if (row.message_id) byMessageId.set(row.message_id, row);
  }

  return byMessageId;
}

/** Most recent delivery per application, for the interview board. */
export async function getLatestDeliveryByApplicationIds(
  applicationIds: string[],
): Promise<Map<string, RecruitmentDelivery>> {
  const latest = new Map<string, RecruitmentDelivery>();
  if (applicationIds.length === 0) return latest;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .in('application_id', applicationIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to load application deliveries:',
      error.message,
    );
    return latest;
  }

  for (const row of (data ?? []) as RecruitmentDelivery[]) {
    if (!latest.has(row.application_id)) latest.set(row.application_id, row);
  }

  return latest;
}

/**
 * Puts a failed delivery back in the queue and reports the new attempt count.
 * The caller is responsible for re-publishing the event; if that fails the row is
 * moved back to `failed` by `failDelivery`.
 */
export async function resetDeliveryForRetry(
  deliveryId: string,
): Promise<RecruitmentDelivery | null> {
  const current = await getDeliveryById(deliveryId);
  if (!current) return null;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      status: 'queued',
      attempts: current.attempts + 1,
      event_id: null,
      discord_message_id: null,
      delivered_at: null,
      error_code: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId)
    .select('*')
    .single();

  if (error) {
    console.error(
      '[Recruitment:Deliveries] Failed to reset delivery for retry:',
      error.message,
    );
    return null;
  }

  return (data as RecruitmentDelivery) ?? null;
}
