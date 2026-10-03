import 'server-only';

import {
  attachDeliveryEvent,
  createDelivery,
  failDelivery,
  getDeliveryById,
} from '@/shared/lib/recruitment/discord-deliveries';
import { fetchDiscordGuildMembership } from '@/shared/lib/recruitment/discord-membership';
import {
  publishRecruitmentBotEvent,
  type RecruitmentBotEvent,
} from '@/shared/lib/recruitment/bot-events';
import type {
  DeliveryKind,
  RecipientKind,
  RecruitmentDelivery,
} from '@/shared/lib/recruitment/delivery-status';

export type TrackedNotification = {
  applicationId: string;
  kind: DeliveryKind;
  recipientKind: RecipientKind;
  recipientDiscordId: string | null;
  /** Built only when the notification is actually going to be queued. */
  buildEvent: (recipientDiscordId: string) => RecruitmentBotEvent;
};

/**
 * Queues a Discord notification and records what happened to it.
 *
 * The three outcomes that used to be indistinguishable are now distinct:
 * - no Discord account on file → `skipped_no_discord`, and no event is queued;
 * - the event could not be queued → `failed` with `event_publish_failed`;
 * - queued → `queued`, which the bot later resolves to `sent` or `failed`.
 *
 * The send is never blocked because the applicant is outside the server: opening a
 * DM channel with a non-member works, so pre-blocking would discard deliveries
 * that can succeed and would hide the real Discord error code.
 */
export async function publishTrackedNotification(
  input: TrackedNotification,
): Promise<RecruitmentDelivery | null> {
  const recipientDiscordId = input.recipientDiscordId;

  if (!recipientDiscordId) {
    const skippedId = await createDelivery({
      applicationId: input.applicationId,
      kind: input.kind,
      recipientKind: input.recipientKind,
      status: 'skipped_no_discord',
    });
    return skippedId ? getDeliveryById(skippedId) : null;
  }

  const recipientInGuild =
    await fetchDiscordGuildMembership(recipientDiscordId);

  const deliveryId = await createDelivery({
    applicationId: input.applicationId,
    kind: input.kind,
    recipientKind: input.recipientKind,
    status: 'queued',
    recipientDiscordId,
    recipientInGuild,
  });

  if (!deliveryId) return null;

  const published = await publishRecruitmentBotEvent(
    input.buildEvent(recipientDiscordId),
  );

  if (!published.ok) {
    await failDelivery(deliveryId, 'event_publish_failed', published.error);
    return getDeliveryById(deliveryId);
  }

  await attachDeliveryEvent(deliveryId, published.id);
  return getDeliveryById(deliveryId);
}

/**
 * Re-queues the event for an existing delivery row, used by the manual retry. The
 * row keeps its history: `resetDeliveryForRetry` bumps `attempts` and clears the
 * previous outcome before this is called.
 */
export async function republishTrackedNotification(
  deliveryId: string,
  recipientDiscordId: string,
  buildEvent: (recipientDiscordId: string) => RecruitmentBotEvent,
): Promise<RecruitmentDelivery | null> {
  const published = await publishRecruitmentBotEvent(
    buildEvent(recipientDiscordId),
  );

  if (!published.ok) {
    await failDelivery(deliveryId, 'event_publish_failed', published.error);
    return getDeliveryById(deliveryId);
  }

  await attachDeliveryEvent(deliveryId, published.id);
  return getDeliveryById(deliveryId);
}
