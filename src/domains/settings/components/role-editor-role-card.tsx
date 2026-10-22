"use client";

import { IconDeviceFloppy, IconRefresh } from "@/shared/ui/tabler-icons";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import type { AppRole } from "@/shared/types/auth";
import type { RoleEditorMode } from "./role-editor.types";

export function RoleEditorRoleCard({
  mode,
  role,
  title,
  ids,
  savingRole,
  onFieldChange,
  onSave,
}: {
  mode: RoleEditorMode;
  role: AppRole;
  title: string;
  ids: {
    level: string;
    label: string;
    description: string;
    color: string;
    access: string;
    raider: string;
    isAdmin: string;
    superAdmin: string;
  };
  savingRole: boolean;
  onFieldChange: (field: keyof AppRole, value: any) => void;
  onSave: () => void;
}) {
  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-white">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.level}>Identificador</Label>
            <Input
              id={ids.level}
              value={role.level}
              disabled={mode === "edit"}
              onChange={(e) => onFieldChange("level", e.target.value)}
              placeholder="ej: raid-leader"
              className="uppercase"
            />
            <p className="text-[11px] text-white/60">
              Minúsculas, sin espacios. Se usa como referencia interna.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.label}>Nombre visible</Label>
            <Input
              id={ids.label}
              value={role.label}
              onChange={(e) => onFieldChange("label", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={ids.description}>Descripción</Label>
            <Textarea
              id={ids.description}
              value={role.description ?? ""}
              onChange={(e) => onFieldChange("description", e.target.value)}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.color}>Color</Label>
            <Input
              id={ids.color}
              type="color"
              value={role.color}
              onChange={(e) => onFieldChange("color", e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ToggleRow
            label="Acceso a Zona Raider"
            hint="Permite entrar en /zona-raider y sus módulos."
          >
            <Switch
              id={ids.access}
              checked={role.can_access_zona_raider}
              onCheckedChange={(checked) =>
                onFieldChange("can_access_zona_raider", checked)
              }
              aria-label="Acceso a Zona Raider"
              disabled={role.level === "gm"}
            />
          </ToggleRow>

          <ToggleRow label="Super Admin" hint="Ignora la matriz de permisos.">
            <Switch
              id={ids.superAdmin}
              checked={role.is_super_admin}
              onCheckedChange={(checked) =>
                onFieldChange("is_super_admin", checked)
              }
              aria-label="Habilitar super admin"
              disabled={role.level === "gm"}
            />
          </ToggleRow>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ToggleRow
            label="Administrador"
            hint="Puede editar en toda la web y acceder a la zona de administración."
          >
            <Switch
              id={ids.isAdmin}
              checked={role.is_admin}
              onCheckedChange={(checked) => onFieldChange("is_admin", checked)}
              aria-label="Administrador del sitio"
              disabled={role.level === "gm"}
            />
          </ToggleRow>
          <ToggleRow
            label="App Raider"
            hint="Puede usar la app de raiders (WCL, asistencia, loot)."
          >
            <Switch
              id={ids.raider}
              checked={role.can_use_raider_app}
              onCheckedChange={(checked) =>
                onFieldChange("can_use_raider_app", checked)
              }
              aria-label="Acceso a la app de raiders"
              disabled={role.level === "gm"}
            />
          </ToggleRow>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={savingRole} className="gap-2">
            {savingRole ? (
              <IconRefresh className="size-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="size-4" />
            )}
            Guardar rol
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 p-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[11px] text-white/60">{hint}</p>
      </div>
      {children}
    </div>
  );
}
