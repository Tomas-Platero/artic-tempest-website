import { supabaseAdmin } from '@/shared/lib/supabase-admin';
export type RecruitmentBotEvent =
  | {
      type: 'recruitment.chat.message';
      applicationId: string;
      messageId: string;
      authorId: string;
      content: string;
      attachments?: Array<{ url: string; name?: string; contentType?: string }>;
      applicantDiscordUserId: string;
      officerName: string;
      officerRoleLabel: string;
      createdAt: string;
    }
  | {
      type: 'recruitment.application.status_changed';
      applicationId: string;
      applicantDiscordUserId: string;
      previousStatus: string | null;
      status: string;
      characterName: string;
      characterRealm: string;
    }
  | {
      type: 'recruitment.application.created';
      applicationId: string;
      applicantDiscordUserId: string;
      characterName: string;
      characterRealm: string;
      status: string;
      /** True when the application was created by the recruitment self-test/cron; the bot must not DM the applicant. */
      isTest?: boolean;
    }
  | {
      type: 'recruitment.chat.applicant_reply';
      applicationId: string;
      attachments?: Array<{ url: string; name?: string; contentType?: string }>;
      officerDiscordUserId: string;
      applicantName: string;
      characterName: string;
      characterRealm: string;
      content: string;
    };

/**
 * Queues an event for the Discord bot to pick up.
 *
 * Returns the created row id so a delivery can be linked to it, or the failure
 * reason. Callers that do not track delivery may keep ignoring the result, but a
 * failure must never be silent when the caller does care.
 */
export type PublishBotEventResult =
  { ok: true; id: string } | { ok: false; error: string };

export async function publishRecruitmentBotEvent(
  event: RecruitmentBotEvent,
): Promise<PublishBotEventResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('recruitment_bot_events')
      .insert({
        type: event.type,
        payload: event,
      })
      .select('id')
      .single();

    if (error) {
      console.error(
        '[Recruitment:BotEvents] Failed to insert event:',
        event.type,
        error,
      );
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data.id };
  } catch (err: any) {
    console.error(
      '[Recruitment:BotEvents] Failed to publish event:',
      event.type,
      err,
    );
    return { ok: false, error: err?.message ?? String(err) };
  }
}
