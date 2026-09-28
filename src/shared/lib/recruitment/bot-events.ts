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

export async function publishRecruitmentBotEvent(
  event: RecruitmentBotEvent,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('recruitment_bot_events')
      .insert({
        type: event.type,
        payload: event,
      });

    if (error) {
      console.error(
        '[Recruitment:BotEvents] Failed to insert event:',
        event.type,
        error,
      );
    }
  } catch (err) {
    console.error(
      '[Recruitment:BotEvents] Failed to publish event:',
      event.type,
      err,
    );
  }
}
