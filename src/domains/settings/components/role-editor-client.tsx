"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import type { AppRole } from "@/shared/types/auth";
import { Button } from "@/shared/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/ui/breadcrumb";
import { IconArrowLeft } from "@/shared/ui/tabler-icons";
import Link from "next/link";
import { RoleEditorRoleCard } from "./role-editor-role-card";
import type { RoleEditorMode } from "./role-editor.types";

async function doCreateRole(
  role: AppRole,
  templateSource?: string | null,
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const res = await fetch("/api/guild/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: role.level.trim().toLowerCase(),
        label: role.label,
        description: role.description,
        priority: role.priority,
        color: role.color,
        canAccessZonaRaider: role.can_access_zona_raider,
        canUseRaiderApp: role.can_use_raider_app,
        isSuperAdmin: role.is_super_admin,
        isAdmin: role.is_admin,
        permissionsFrom: templateSource ?? undefined,
      }),
    });
    if (!res.ok) {
      const errData = await res.json();
      return {
        success: false,
        error: errData.error || "No se pudo crear el rol",
      };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "No se pudo crear el rol",
    };
  }
}

async function doUpdateRole(
  level: string,
  role: AppRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/guild/roles/${level}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: role.label,
        description: role.description,
        priority: role.priority,
        color: role.color,
        canAccessZonaRaider: role.can_access_zona_raider,
        canUseRaiderApp: role.can_use_raider_app,
        isSuperAdmin: role.is_super_admin,
        isAdmin: role.is_admin,
      }),
    });
    if (!res.ok) {
      const errData = await res.json();
      return { success: false, error: errData.error || "No se pudo guardar" };
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "No se pudo guardar" };
  }
}

type RoleEditorClientProps = {
  mode: RoleEditorMode;
  initialRole: AppRole | null;
  templateRole?: AppRole | null;
  templateSource?: string | null;
};

export function RoleEditorClient(props: RoleEditorClientProps) {
  return useRoleEditorClient(props);
}

function useRoleEditorClient({
  mode,
  initialRole,
  templateRole,
  templateSource,
}: RoleEditorClientProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [savingRole, setSavingRole] = useState(false);

  const levelInputId = useId();
  const labelInputId = useId();
  const descriptionInputId = useId();
  const colorInputId = useId();
  const accessSwitchId = useId();
  const isAdminSwitchId = useId();
  const superAdminSwitchId = useId();

  const [role, setRole] = useState<AppRole>(
    () =>
      initialRole ??
      (templateRole
        ? { ...templateRole, level: "" }
        : {
            level: "",
            label: "",
            description: "",
            priority: 100,
            color: "#60a5fa",
            can_access_zona_raider: false,
            can_use_raider_app: false,
            is_super_admin: false,
            is_admin: false,
          }),
  );

  const title = mode === "create" ? "Crear rol" : `Editar rol`;

  const handleFieldChange = (field: keyof AppRole, value: any) => {
    setRole((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveRole = async () => {
    if (!role.label.trim() || !role.level.trim()) {
      toast.error("Completa el identificador y el nombre del rol");
      return;
    }

    setSavingRole(true);
    if (mode === "create") {
      const result = await doCreateRole(role, templateSource);
      if (result.success && result.data) {
        void mutate("/api/guild/roles");
        toast.success("Rol creado correctamente");
        router.replace(
          `/zona-raider/configuracion/roles/${result.data.role.level}`,
        );
        router.refresh();
      } else {
        toast.error(result.error || "Error al guardar el rol");
      }
    } else {
      const result = await doUpdateRole(role.level, role);
      if (result.success) {
        void mutate("/api/guild/roles");
        toast.success("Rol actualizado");
        router.refresh();
      } else {
        toast.error(result.error || "Error al guardar el rol");
      }
    }
    setSavingRole(false);
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:px-8 w-full max-w-full">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/zona-raider/configuracion">Configuración</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/zona-raider/configuracion/roles">Roles</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          asChild
          className="gap-2 text-white/60 hover:text-white"
        >
          <Link href="/zona-raider/configuracion/roles">
            <IconArrowLeft className="size-4" /> Volver al listado
          </Link>
        </Button>
      </div>

      <div className="grid gap-6">
        <RoleEditorRoleCard
          mode={mode}
          role={role}
          title={mode === "create" ? "Nuevo rol" : `Editar: ${role.label}`}
          ids={{
            level: levelInputId,
            label: labelInputId,
            description: descriptionInputId,
            color: colorInputId,
            access: accessSwitchId,
            isAdmin: isAdminSwitchId,
            superAdmin: superAdminSwitchId,
          }}
          savingRole={savingRole}
          onFieldChange={handleFieldChange}
          onSave={() => void handleSaveRole()}
        />
      </div>
    </div>
  );
}
