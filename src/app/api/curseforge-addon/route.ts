import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CurseforgePayload = {
  modId?: number;
};

type InvokeErrorShape = {
  message?: string;
  status?: number;
  context?: unknown;
};

function parseInvokeContext(context: unknown): Record<string, unknown> | null {
  if (!context) return null;

  if (typeof context === 'string') {
    try {
      const parsed = JSON.parse(context) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return { raw: context };
    } catch {
      return { raw: context };
    }
  }

  if (typeof context === 'object') {
    return context as Record<string, unknown>;
  }

  // oxlint-disable-next-line no-base-to-string
  return { raw: String(context) };
}

function toHttpStatus(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isInteger(value)) return null;
  if (value < 400 || value > 599) return null;
  return value;
}

function isValidModId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value > 0
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'No autorizado', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let payload: CurseforgePayload;
  try {
    payload = (await request.json()) as CurseforgePayload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'INVALID_JSON_BODY' },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: 'Body must be a JSON object', code: 'INVALID_BODY' },
      { status: 400 },
    );
  }

  if (!isValidModId(payload.modId)) {
    return NextResponse.json(
      { error: 'Missing or invalid "modId"', code: 'INVALID_MOD_ID' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.functions.invoke(
    'curseforge-addon',
    {
      body: { modId: payload.modId },
    },
  );

  if (error) {
    console.error('[CurseForgeAddon] Supabase function error', error);

    const invokeError = error as InvokeErrorShape;
    const context = parseInvokeContext(invokeError.context);
    const upstreamStatus =
      toHttpStatus(context?.status ?? context?.statusCode) ?? null;
    const status = toHttpStatus(invokeError.status) ?? upstreamStatus ?? 502;

    const upstreamMessage =
      (typeof context?.error === 'string' && context.error) ||
      (typeof context?.message === 'string' && context.message) ||
      invokeError.message ||
      'CurseForge upstream request failed';

    return NextResponse.json(
      {
        error: upstreamMessage,
        code: 'UPSTREAM_REQUEST_FAILED',
        modId: payload.modId,
        upstreamStatus,
        diagnostics: context?.diagnostics ?? null,
        upstream: context,
      },
      { status },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Addon data not found', code: 'ADDON_NOT_FOUND' },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}
