import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { ensureAppPermission } from '@/shared/auth/permissions';

const DISCORD_ROLE_ID_PATTERN = /^\d{5,25}$/;

type MappingInput = {
  roleId: string;
  name: string;
  level: string;
};

type ValidationResult =
  { ok: true; value: MappingInput } | { ok: false; error: string };

async function getConfiguredLevels(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin.from('app_roles').select('level');

  if (error) throw error;

  return new Set(
    (data ?? []).map((row) =>
      String(row.level ?? '')
        .trim()
        .toLowerCase(),
    ),
  );
}

type MappingBody = {
  roleId?: unknown;
  name?: unknown;
  level?: unknown;
};

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeLevel(level: unknown) {
  return asString(level).trim().toLowerCase();
}

async function validateMapping(
  body: MappingBody | null,
): Promise<ValidationResult> {
  const roleId = asString(body?.roleId).trim();
  const name = asString(body?.name).trim();
  const level = normalizeLevel(body?.level);

  if (!roleId || !name || !level) {
    return { ok: false, error: 'Faltan parámetros' };
  }

  if (!DISCORD_ROLE_ID_PATTERN.test(roleId)) {
    return { ok: false, error: 'El ID del rol de Discord no es válido.' };
  }

  const validLevels = await getConfiguredLevels();

  if (!validLevels.has(level)) {
    return {
      ok: false,
      error: `El nivel "${level}" no existe en la gestión de roles.`,
    };
  }

  return { ok: true, value: { roleId, name, level } };
}

function dbErrorMessage(error: {
  code?: string;
  message?: string;
}): string | null {
  if (error.code === '23505') {
    return 'Ese rol de Discord ya está mapeado a un nivel interno.';
  }
  if (error.code === '23503') {
    return 'El nivel interno seleccionado ya no existe.';
  }
  if (error.code === '23514') {
    return 'Ese nivel todavía no está permitido para mapeos de Discord (falta la migración 00000000000009_app_discord_roles_level_fkey).';
  }
  return null;
}

export async function POST(request: Request) {
  try {
    await ensureAppPermission('settings-discord', 'manage');

    const body = await request.json();
    const validated = await validateMapping(body);

    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { roleId, name, level } = validated.value;
    const { error } = await supabaseAdmin.from('app_discord_roles').insert({
      role_id: roleId,
      name,
      level,
    });

    if (error) {
      const message = dbErrorMessage(error);
      if (message) {
        return NextResponse.json(
          { error: message },
          { status: error.code === '23505' ? 409 : 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('POST /api/guild/roles/discord error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAppPermission('settings-discord', 'manage');

    const url = new URL(request.url);
    const roleId = url.searchParams.get('roleId')?.trim();

    if (!roleId) {
      return NextResponse.json({ error: 'Falta el roleId' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('app_discord_roles')
      .delete()
      .eq('role_id', roleId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/guild/roles/discord error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureAppPermission('settings-discord', 'manage');

    const body = await request.json();
    const oldRoleId = String(body?.oldRoleId ?? '').trim();
    const validated = await validateMapping(body);

    if (!oldRoleId) {
      return NextResponse.json(
        { error: 'Falta el mapeo original' },
        { status: 400 },
      );
    }

    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { roleId, name, level } = validated.value;

    if (oldRoleId !== roleId) {
      // Insertamos el nuevo mapeo antes de borrar el antiguo para no perder
      // el rol original si la inserción falla.
      const { error: insertError } = await supabaseAdmin
        .from('app_discord_roles')
        .insert({ role_id: roleId, name, level });

      if (insertError) {
        const message = dbErrorMessage(insertError);
        if (message) {
          return NextResponse.json(
            { error: message },
            { status: insertError.code === '23505' ? 409 : 400 },
          );
        }
        throw insertError;
      }

      const { error: deleteError } = await supabaseAdmin
        .from('app_discord_roles')
        .delete()
        .eq('role_id', oldRoleId);

      if (deleteError) throw deleteError;
    } else {
      const { error } = await supabaseAdmin
        .from('app_discord_roles')
        .update({ name, level })
        .eq('role_id', oldRoleId);

      if (error) {
        const message = dbErrorMessage(error);
        if (message) {
          return NextResponse.json(
            { error: message },
            { status: error.code === '23505' ? 409 : 400 },
          );
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('PUT /api/guild/roles/discord error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
