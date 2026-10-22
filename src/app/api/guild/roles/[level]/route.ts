import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { ensureAdmin } from '@/shared/auth/permissions';
import { invalidateRolesCache } from '@/shared/auth/roles';
import { logRoleAudit } from '@/shared/lib/role-audit.server';

type AppRoleUpdate = {
  label?: string | null;
  description?: string | null;
  priority?: number;
  color?: string;
  can_access_zona_raider?: boolean;
  is_super_admin?: boolean;
  is_admin?: boolean;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ level: string }> },
) {
  const [session, { level }] = await Promise.all([ensureAdmin(), params]);
  const normalizedLevel = level.trim().toLowerCase();
  const isGmRole = normalizedLevel === 'gm';

  try {
    const { data: currentRole } = await supabaseAdmin
      .from('app_roles')
      .select(
        'level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin',
      )
      .eq('level', normalizedLevel)
      .maybeSingle();

    const body = await req.json();
    const payload: AppRoleUpdate = {};

    if (body.label !== undefined)
      payload.label = body.label?.toString()?.trim() || null;
    if (body.roleLabel !== undefined)
      payload.label = body.roleLabel?.toString()?.trim() || null;
    if (body.role_slug !== undefined || body.roleSlug !== undefined) {
      const requestedSlug = (body.role_slug ?? body.roleSlug)
        ?.toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      if (requestedSlug && requestedSlug !== normalizedLevel) {
        return NextResponse.json(
          { error: 'El identificador estable no puede cambiar en edición' },
          { status: 400 },
        );
      }
    }
    if (body.description !== undefined)
      payload.description = body.description?.toString() || null;
    if (body.priority !== undefined) payload.priority = Number(body.priority);
    if (body.color !== undefined)
      payload.color = body.color?.toString()?.trim() || '#94a3b8';
    if (body.canAccessZonaRaider !== undefined)
      payload.can_access_zona_raider = Boolean(body.canAccessZonaRaider);
    if (body.isSuperAdmin !== undefined)
      payload.is_super_admin = Boolean(body.isSuperAdmin);
    if (body.isAdmin !== undefined) payload.is_admin = Boolean(body.isAdmin);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Sin cambios' }, { status: 400 });
    }

    if (isGmRole) {
      payload.can_access_zona_raider = true;
      payload.is_super_admin = true;
    }

    const { data, error } = await supabaseAdmin
      .from('app_roles')
      .update(payload)
      .eq('level', normalizedLevel)
      .select(
        'level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin',
      )
      .single();

    if (error) throw error;

    if (payload.is_super_admin === true) {
      // Super admin ignora la matriz de permisos: limpiamos filas obsoletas.
      await supabaseAdmin
        .from('app_permissions')
        .delete()
        .eq('role_level', normalizedLevel);
    }

    await logRoleAudit({
      action: 'role.update',
      roleLevel: normalizedLevel,
      payload: {
        before: currentRole,
        after: data,
      },
      changedBy: session.user?.id,
    });

    invalidateRolesCache();
    return NextResponse.json({
      role: data
        ? { ...data, roleSlug: data.level, roleLabel: data.label }
        : null,
    });
  } catch (error: any) {
    console.error(`[roles] PATCH error for ${normalizedLevel}`, error);
    return NextResponse.json(
      { error: error.message || 'No se pudo actualizar el rol' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ level: string }> },
) {
  const [session, { level }] = await Promise.all([ensureAdmin(), params]);
  const normalizedLevel = level.trim().toLowerCase();

  if (['gm', 'invitado'].includes(normalizedLevel)) {
    return NextResponse.json(
      { error: 'No puedes eliminar este rol por defecto' },
      { status: 400 },
    );
  }

  try {
    const { data: existingRole, error: fetchError } = await supabaseAdmin
      .from('app_roles')
      .select(
        'level,label,description,priority,color,can_access_zona_raider,is_super_admin,is_admin',
      )
      .eq('level', normalizedLevel)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingRole) {
      return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
    }

    const [, , { error }] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .update({ role_level: 'invitado' })
        .eq('role_level', normalizedLevel),
      supabaseAdmin
        .from('app_permissions')
        .delete()
        .eq('role_level', normalizedLevel),
      supabaseAdmin.from('app_roles').delete().eq('level', normalizedLevel),
    ]);

    if (error) throw error;

    await logRoleAudit({
      action: 'role.delete',
      roleLevel: normalizedLevel,
      payload: {
        reassignedTo: 'invitado',
        role: existingRole,
      },
      changedBy: session.user?.id,
    });

    invalidateRolesCache();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[roles] DELETE error for ${normalizedLevel}`, error);
    return NextResponse.json(
      { error: error.message || 'No se pudo eliminar el rol' },
      { status: 500 },
    );
  }
}
