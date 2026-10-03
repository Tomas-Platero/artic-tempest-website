import 'server-only';

import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { getLatestDeliveryByApplicationIds } from '@/shared/lib/recruitment/discord-deliveries';
import { fetchDiscordGuildMembership } from '@/shared/lib/recruitment/discord-membership';
import {
  describeReachability,
  type Reachability,
  type RecruitmentDelivery,
} from '@/shared/lib/recruitment/delivery-status';

export type InterviewQueueMessage = {
  authorId: string;
  content: string | null;
  createdAt: string;
};

export type InterviewQueueItem = {
  applicationId: string;
  characterName: string;
  characterRealm: string | null;
  characterClass: number | null;
  characterSpec: string | null;
  discordUserId: string | null;
  /** Whole days since the application last changed, which is when it entered or
   *  was last touched during the interview phase. */
  daysInPhase: number;
  lastMessage: InterviewQueueMessage | null;
  /** True when the applicant wrote the most recent message, i.e. staff owe a reply. */
  awaitingStaffReply: boolean;
  lastStaffDelivery: RecruitmentDelivery | null;
  reachability: Reachability;
};

type ApplicationRow = {
  id: string;
  user_id: string;
  character_name: string;
  character_realm: string | null;
  character_class: number | null;
  character_spec: string | null;
  updated_at: string;
};

type MessageRow = {
  application_id: string;
  author_id: string;
  content: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  discord_user_id: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the interview board needs, in one place: who is in the interview
 * phase, what the last message was, whether the last staff notification was
 * actually delivered, and whether the applicant can be reached by DM at all.
 *
 * Reachability is asked here rather than stored on the profile, because guild
 * membership changes and a login-time snapshot goes stale.
 */
export async function loadInterviewQueue(): Promise<InterviewQueueItem[]> {
  const { data: applications, error } = await supabaseAdmin
    .from('recruitment_applications')
    .select(
      'id, user_id, character_name, character_realm, character_class, character_spec, updated_at',
    )
    .eq('status', 'interview')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(
      '[Recruitment:InterviewQueue] Failed to load applications:',
      error.message,
    );
    return [];
  }

  const rows = (applications ?? []) as ApplicationRow[];
  if (rows.length === 0) return [];

  const applicationIds = rows.map((row) => row.id);
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));

  const [{ data: messageRows }, { data: profileRows }, deliveries] =
    await Promise.all([
      supabaseAdmin
        .from('application_messages')
        .select('application_id, author_id, content, created_at')
        .in('application_id', applicationIds)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('profiles')
        .select('user_id, discord_user_id')
        .in('user_id', userIds),
      getLatestDeliveryByApplicationIds(applicationIds),
    ]);

  const profileByUserId = new Map<string, ProfileRow>(
    ((profileRows ?? []) as ProfileRow[]).map((profile) => [
      profile.user_id,
      profile,
    ]),
  );

  const lastMessageByApplication = new Map<string, MessageRow>();
  for (const message of (messageRows ?? []) as MessageRow[]) {
    if (!lastMessageByApplication.has(message.application_id)) {
      lastMessageByApplication.set(message.application_id, message);
    }
  }

  const now = Date.now();

  return Promise.all(
    rows.map(async (row) => {
      const profile = profileByUserId.get(row.user_id);
      const discordUserId = profile?.discord_user_id ?? null;
      const lastMessage = lastMessageByApplication.get(row.id) ?? null;
      const lastStaffDelivery = deliveries.get(row.id) ?? null;

      const inGuild = discordUserId
        ? await fetchDiscordGuildMembership(discordUserId)
        : null;

      const updatedAt = Date.parse(row.updated_at);

      return {
        applicationId: row.id,
        characterName: row.character_name,
        characterRealm: row.character_realm,
        characterClass: row.character_class,
        characterSpec: row.character_spec,
        discordUserId,
        daysInPhase: Number.isNaN(updatedAt)
          ? 0
          : Math.max(0, Math.floor((now - updatedAt) / DAY_MS)),
        lastMessage: lastMessage
          ? {
              authorId: lastMessage.author_id,
              content: lastMessage.content,
              createdAt: lastMessage.created_at,
            }
          : null,
        awaitingStaffReply: lastMessage?.author_id === row.user_id,
        lastStaffDelivery,
        reachability: describeReachability({
          hasDiscord: Boolean(discordUserId),
          inGuild,
        }),
      } satisfies InterviewQueueItem;
    }),
  );
}
