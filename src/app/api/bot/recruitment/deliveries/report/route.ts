import { NextRequest, NextResponse } from 'next/server';
import { enforceBearerToken } from '@/shared/api/public-auth';
import { recordDeliveryReport } from '@/shared/lib/recruitment/discord-deliveries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REPORTABLE_STATUSES = ['sent', 'failed'] as const;

type ReportableStatus = (typeof REPORTABLE_STATUSES)[number];

function isReportableStatus(value: unknown): value is ReportableStatus {
  return (
    typeof value === 'string' &&
    (REPORTABLE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Only primitives are stringified: an unexpected object would otherwise be stored
 * as the useless "[object Object]".
 */
function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/**
 * The Discord bot reports here what actually happened to a DM it attempted.
 *
 * This is the other half of the delivery ledger: the web queues an event and the
 * bot is the only witness of the send, so without this report a failed DM stayed
 * invisible forever.
 */
export async function POST(request: NextRequest) {
  const authError = await enforceBearerToken(request);
  if (authError) return authError;

  try {
    const body: Record<string, unknown> = await request.json();
    const { eventId, status, discordMessageId, errorCode, errorMessage } =
      body ?? {};

    if (!eventId || typeof eventId !== 'string') {
      return NextResponse.json({ error: 'Falta eventId' }, { status: 400 });
    }

    if (!isReportableStatus(status)) {
      return NextResponse.json(
        { error: `status debe ser ${REPORTABLE_STATUSES.join(' o ')}` },
        { status: 400 },
      );
    }

    const result = await recordDeliveryReport({
      eventId,
      status,
      discordMessageId: asNullableString(discordMessageId),
      errorCode: asNullableString(errorCode),
      errorMessage: asNullableString(errorMessage),
    });

    // `matched: false` is normal: the bot also reports event kinds this app
    // does not track, and the bot must not treat that as a failure.
    return NextResponse.json({ success: true, matched: result.matched });
  } catch (error: any) {
    console.error('[Bot:DeliveryReport] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
