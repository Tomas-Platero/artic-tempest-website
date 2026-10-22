"use client";

import { useState, type ReactNode } from "react";
import {
  IconBrandDiscord,
  IconDeviceFloppy,
  IconTrash,
  IconSettings,
  IconShieldLock,
  IconExternalLink,
  IconInfoCircle,
  IconEdit,
  IconShield,
  IconUsers,
  IconSword,
  IconUser,
} from "@/shared/ui/tabler-icons";
import { Button } from "@/shared/ui/button";
import { AdminSectionHeader } from "@/shared/components/admin-section-header";
import { Input } from "@/shared/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { toast } from "sonner";
import Link from "next/link";
import useSWR from "swr";

import type { RoleLevel } from "@/shared/types/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

type DiscordRoleConfig = {
  role_id: string;
  name: string;
  level: RoleLevel;
};

interface DiscordServerRole {
  id: string;
  name: string;
  position: number;
}

interface SettingsDiscordProps {
  initialCredentials: {
    discord_client_id: string;
    discord_client_secret: string;
    discord_app_id: string;
    discord_bot_token: string;
    discord_guild_id: string;
    discord_public_key: string;
    discord_streams_channel_id: string;
    discord_recruitment_channel_id: string;
    discord_requested_scopes: string;
  };
  initialRoles: DiscordRoleConfig[];
  availableRoles: InternalRoleOption[];
}

type InternalRoleOption = {
  level: string;
  label: string;
  color: string;
  priority: number;
};

const FALLBACK_INTERNAL_ROLES: InternalRoleOption[] = [
  {
    level: "gm",
    label: "Maestro de Hermandad",
    color: "#fbbf24",
    priority: 500,
  },
  { level: "officer", label: "Oficial", color: "#38bdf8", priority: 400 },
  { level: "raider", label: "Raider", color: "#34d399", priority: 250 },
  { level: "trial", label: "Trial", color: "#a78bfa", priority: 200 },
  { level: "member", label: "Miembro", color: "#60a5fa", priority: 100 },
  { level: "invitado", label: "Invitado", color: "#94a3b8", priority: 100 },
];

function resolveInternalRoles(available: InternalRoleOption[]) {
  return available.length > 0 ? available : FALLBACK_INTERNAL_ROLES;
}

function resolveDefaultLevel(roles: InternalRoleOption[]) {
  return (
    roles.find((role) => role.level === "member")?.level ??
    roles[0]?.level ??
    "member"
  );
}

type RoleDisplayConfig = {
  label: string;
  badge: string;
  color: string;
  icon: ReactNode;
};

const getRoleDisplay = (
  role: RoleLevel,
  roles: InternalRoleOption[] = FALLBACK_INTERNAL_ROLES,
): RoleDisplayConfig => {
  const meta = roles.find((item) => item.level === role);
  const configs: Record<
    RoleLevel,
    Omit<RoleDisplayConfig, "color" | "label">
  > = {
    gm: {
      badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      icon: <IconShield className="size-4 mr-2" />,
    },
    officer: {
      badge: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      icon: <IconUser className="size-4 mr-2" />,
    },
    raider: {
      badge: "bg-green-500/10 text-green-500 border-green-500/20",
      icon: <IconSword className="size-4 mr-2" />,
    },
    member: {
      badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
      icon: <IconUser className="size-4 mr-2" />,
    },
    invitado: {
      badge: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
      icon: <IconUser className="size-4 mr-2" />,
    },
  };
  const base = configs[role] ?? configs.invitado;
  return {
    ...base,
    label:
      meta?.label ??
      FALLBACK_INTERNAL_ROLES.find((item) => item.level === role)?.label ??
      role,
    color: meta?.color ?? "#94a3b8",
  };
};

async function doSaveCredentials(
  payload: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleaned = { ...payload };
    if (cleaned.discord_client_secret === "••••••••••••••••")
      delete (cleaned as any).discord_client_secret;
    if (cleaned.discord_bot_token === "••••••••••••••••")
      delete (cleaned as any).discord_bot_token;

    const res = await fetch("/api/guild/settings/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleaned),
    });
    if (!res.ok) throw new Error("Error al guardar la configuración");
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function doSaveDiscordMapping(
  editingId: string | null,
  roleForm: { newRoleId: string; newRoleName: string; newRoleLevel: RoleLevel },
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = editingId
      ? await fetch("/api/guild/roles/discord", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldRoleId: editingId,
            roleId: roleForm.newRoleId,
            name: roleForm.newRoleName,
            level: roleForm.newRoleLevel,
          }),
        })
      : await fetch("/api/guild/roles/discord", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roleId: roleForm.newRoleId,
            name: roleForm.newRoleName,
            level: roleForm.newRoleLevel,
          }),
        });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return {
        success: false,
        error: data?.error || "No se pudo guardar el mapeo",
      };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function doDeleteDiscordMapping(
  roleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/guild/roles/discord?roleId=${roleId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return {
        success: false,
        error: data?.error || "Error al eliminar mapeo",
      };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Error al eliminar mapeo" };
  }
}

async function doSyncRolesMetadata(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/api/discord/roles-vinculados/metadata", {
      method: "PUT",
    });
    if (!res.ok) throw new Error("No se pudo sincronizar");
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Error al sincronizar metadata",
    };
  }
}

export function SettingsDiscordClient(props: SettingsDiscordProps) {
  return useSettingsDiscordClient(props);
}

function useSettingsDiscordClient({
  initialCredentials,
  initialRoles,
  availableRoles,
}: SettingsDiscordProps) {
  const internalRoles = resolveInternalRoles(availableRoles);
  const defaultLevel = resolveDefaultLevel(internalRoles);
  const [state, setState] = useState(() => ({
    ui: {
      saving: false,
      refreshing: false,
      activeTab: "general",
      copiedId: null as string | null,
      editingRoleId: null as string | null,
      isMappingModalOpen: false,
    },
    discordRoles: initialRoles,
    roleForm: {
      newRoleId: "",
      newRoleName: "",
      newRoleLevel: defaultLevel,
    },
    form: {
      discord_client_id: initialCredentials.discord_client_id || "",
      discord_client_secret: initialCredentials.discord_client_secret
        ? "••••••••••••••••"
        : "",
      discord_app_id: initialCredentials.discord_app_id || "",
      discord_bot_token: initialCredentials.discord_bot_token
        ? "••••••••••••••••"
        : "",
      discord_guild_id: initialCredentials.discord_guild_id || "",
      discord_public_key: initialCredentials.discord_public_key || "",
      discord_streams_channel_id:
        initialCredentials.discord_streams_channel_id || "",
      discord_recruitment_channel_id:
        initialCredentials.discord_recruitment_channel_id || "",
      discord_requested_scopes:
        initialCredentials.discord_requested_scopes || "",
    },
  }));
  const { ui, discordRoles, roleForm, form } = state;

  const setUi = (value: React.SetStateAction<typeof ui>) =>
    setState((prev) => ({
      ...prev,
      ui: typeof value === "function" ? (value as any)(prev.ui) : value,
    }));
  const setDiscordRoles = (value: React.SetStateAction<typeof discordRoles>) =>
    setState((prev) => ({
      ...prev,
      discordRoles:
        typeof value === "function" ? (value as any)(prev.discordRoles) : value,
    }));
  const setRoleForm = (value: React.SetStateAction<typeof roleForm>) =>
    setState((prev) => ({
      ...prev,
      roleForm:
        typeof value === "function" ? (value as any)(prev.roleForm) : value,
    }));
  const setForm = (value: React.SetStateAction<typeof form>) =>
    setState((prev) => ({
      ...prev,
      form: typeof value === "function" ? (value as any)(prev.form) : value,
    }));
  const [syncingMetadata, setSyncingMetadata] = useState(false);

  const { data: discordServerRoles = [], isLoading: isLoadingRoles } = useSWR(
    ui.activeTab === "roles" ? "/api/discord/roles" : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Error fetching Discord roles");
      }

      const data: DiscordServerRole[] = await res.json();
      return data.toSorted((a, b) => b.position - a.position);
    },
    { revalidateOnFocus: false },
  );

  const mappedRoleIds = new Set(discordRoles.map((role) => role.role_id));
  const availableDiscordRoles = discordServerRoles.filter(
    (role) => role.id === roleForm.newRoleId || !mappedRoleIds.has(role.id),
  );

  const handleSave = async () => {
    setUi((prev) => ({ ...prev, saving: true }));
    const result = await doSaveCredentials(form);
    if (result.success) {
      toast.success("Configuración guardada", {
        description:
          "Los cambios en las credenciales de Discord se han aplicado correctamente.",
      });
    } else {
      toast.error("Error", { description: result.error });
    }
    setUi((prev) => ({ ...prev, saving: false }));
  };

  const startEditDiscordMapping = (role: DiscordRoleConfig) => {
    setUi((prev) => ({
      ...prev,
      editingRoleId: role.role_id,
      isMappingModalOpen: true,
    }));
    setRoleForm({
      newRoleId: role.role_id,
      newRoleName: role.name,
      newRoleLevel: role.level,
    });
  };

  const cancelEditDiscordMapping = () => {
    setUi((prev) => ({
      ...prev,
      editingRoleId: null,
      isMappingModalOpen: false,
    }));
    setRoleForm({ newRoleId: "", newRoleName: "", newRoleLevel: defaultLevel });
  };

  const handleSaveDiscordMapping = async () => {
    if (!roleForm.newRoleId) {
      toast.error("Selecciona un rol de Discord");
      return;
    }

    if (!roleForm.newRoleName.trim()) {
      toast.error("Indica el nombre del rango en la web");
      return;
    }

    setUi((prev) => ({ ...prev, saving: true }));

    const result = await doSaveDiscordMapping(ui.editingRoleId, roleForm);
    if (result.success) {
      if (ui.editingRoleId) {
        setDiscordRoles((prev) =>
          prev.map((r) =>
            r.role_id === ui.editingRoleId
              ? {
                  role_id: roleForm.newRoleId,
                  name: roleForm.newRoleName,
                  level: roleForm.newRoleLevel,
                }
              : r,
          ),
        );
        toast.success("Mapeo actualizado");
      } else {
        setDiscordRoles((prev) => [
          ...prev,
          {
            role_id: roleForm.newRoleId,
            name: roleForm.newRoleName,
            level: roleForm.newRoleLevel,
          },
        ]);
        toast.success("Mapeo creado");
      }
      cancelEditDiscordMapping();
    } else {
      toast.error("No se pudo guardar el mapeo", {
        description: result.error,
      });
    }
    setUi((prev) => ({ ...prev, saving: false }));
  };

  const handleDeleteDiscordMapping = async (roleId: string) => {
    const result = await doDeleteDiscordMapping(roleId);
    if (result.success) {
      setDiscordRoles((prev) => prev.filter((r) => r.role_id !== roleId));
      toast.success("Mapeo eliminado");
    } else {
      toast.error(result.error || "Error al eliminar mapeo");
    }
  };

  return (
    <div className="flex flex-col gap-8 py-6 px-4 lg:px-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <AdminSectionHeader
          backHref="/zona-raider/configuracion/"
          backLabel="Volver a configuración"
          title="BOT DE DISCORD"
          description="Control centralizado de la integración con Discord."
          titleClassName="flex"
        />
        <div className="flex gap-2">
          <Button
            variant="glow"
            className="rounded-xl font-semibold text-[10px] tracking-widest gap-2 h-12 px-6"
            onClick={() => void handleSave()}
            disabled={ui.saving}
          >
            {ui.saving ? (
              <div className="size-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
            ) : (
              <IconDeviceFloppy className="size-4" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <Tabs
        value={ui.activeTab}
        onValueChange={(value) =>
          setUi((prev) => ({ ...prev, activeTab: value }))
        }
        className="w-full"
      >
        <div className="flex justify-start mb-8 overflow-x-auto no-scrollbar pb-2">
          <TabsList className="h-14 rounded-2xl p-1.5 bg-muted/20 border border-border/20 shadow-2xl backdrop-blur-md inline-flex">
            <TabsTrigger
              value="general"
              className="rounded-xl font-semibold text-[10px] tracking-[0.2em] gap-2 data-[state=active]:bg-[#5865F2] data-[state=active]:text-white "
            >
              <IconSettings className="size-3.5" /> General
            </TabsTrigger>
            <TabsTrigger
              value="roles"
              className="rounded-xl font-semibold text-[10px] tracking-[0.2em] gap-2 data-[state=active]:bg-[#5865F2] data-[state=active]:text-white "
            >
              <IconUsers className="size-3.5" /> Rangos
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="general"
          className="animate-in fade-in slide-in-from-bottom-4 duration-700 outline-none"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-2 border-primary/10 shadow-2xl bg-card/40 backdrop-blur-md overflow-hidden h-fit">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#5865F2] opacity-50" />
              <CardHeader>
                <CardTitle className="flex items-center gap-3 font-semibold text-xs tracking-[0.3em] text-[#5865F2]">
                  <IconBrandDiscord className="size-5" />
                  Credenciales de la App
                </CardTitle>
                <CardDescription className="text-xs font-medium italic opacity-60">
                  Configura las llaves secretas de tu aplicación de Discord.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="discord-client-id"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    OAuth Client ID (Login de la web)
                  </label>
                  <Input
                    id="discord-client-id"
                    placeholder="Tu Client ID de inicio de sesión"
                    value={form.discord_client_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_client_id: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-client-secret"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    OAuth Client Secret
                  </label>
                  <Input
                    id="discord-client-secret"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={form.discord_client_secret}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_client_secret: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <hr className="border-t border-border/10 my-4" />
                <div className="space-y-2">
                  <label
                    htmlFor="discord-app-id"
                    className="text-[10px] font-semibold tracking-[0.2em] text-[#5865F2] px-1"
                  >
                    Bot Application ID
                  </label>
                  <Input
                    id="discord-app-id"
                    placeholder="ID de la App de tu Bot de Discord"
                    value={form.discord_app_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_app_id: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-bot-token"
                    className="text-[10px] font-semibold tracking-[0.2em] text-[#5865F2] px-1"
                  >
                    Bot Token
                  </label>
                  <Input
                    id="discord-bot-token"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={form.discord_bot_token}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_bot_token: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-guild-id"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    Servidor (Guild ID)
                  </label>
                  <Input
                    id="discord-guild-id"
                    placeholder="ID de tu servidor"
                    value={form.discord_guild_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_guild_id: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-public-key"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    Public Key
                  </label>
                  <Input
                    id="discord-public-key"
                    placeholder="Clave pública de Discord"
                    value={form.discord_public_key}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_public_key: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-requested-scopes"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    OAuth Scopes
                  </label>
                  <Input
                    id="discord-requested-scopes"
                    placeholder="identify guilds guilds.members.read email"
                    value={form.discord_requested_scopes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_requested_scopes: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary/10 shadow-2xl bg-card/40 backdrop-blur-md overflow-hidden h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 font-semibold text-xs tracking-[0.3em] text-[#5865F2]">
                  <IconBrandDiscord className="size-5" />
                  Canales de Discord
                </CardTitle>
                <CardDescription className="text-xs font-medium italic opacity-60">
                  Ajusta los canales usados por automatizaciones.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="discord-streamers-channel-id"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    Streamers Channel ID
                  </label>
                  <Input
                    id="discord-streamers-channel-id"
                    placeholder="Canal para avisos de stream"
                    value={form.discord_streams_channel_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_streams_channel_id: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="discord-recruitment-channel-id"
                    className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground/60 px-1"
                  >
                    Recruitment Channel ID
                  </label>
                  <Input
                    id="discord-recruitment-channel-id"
                    placeholder="Canal de reclutamiento"
                    value={form.discord_recruitment_channel_id}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        discord_recruitment_channel_id: e.target.value,
                      }))
                    }
                    className="h-12 bg-muted/20 border-border/40 font-mono text-sm rounded-xl "
                  />
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                  <p className="text-xs font-medium text-white/60">
                    Verificación de roles vinculados
                  </p>
                  <Link href="/discord/roles-vinculados" target="_blank">
                    <Button className="w-full bg-white/10 hover:bg-white/15 rounded-xl font-semibold text-[10px] tracking-widest gap-2">
                      <IconExternalLink className="size-4" />
                      Abrir verificación
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary/10 shadow-2xl bg-card/40 backdrop-blur-md overflow-hidden h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 font-semibold text-xs tracking-[0.3em] text-amber-500">
                  <IconInfoCircle className="size-5" />
                  Acciones Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                  <p className="text-xs font-medium text-white/60">
                    ¿Necesitas añadir el bot a tu servidor?
                  </p>
                  <Link
                    href={`https://discord.com/api/oauth2/authorize?client_id=${form.discord_client_id}&permissions=8&scope=bot`}
                    target="_blank"
                  >
                    <Button className="w-full bg-[#5865F2] hover:bg-[#4752c4] rounded-xl font-semibold text-[10px] tracking-widest gap-2">
                      <IconExternalLink className="size-4" />
                      Generar Enlace de Invitación
                    </Button>
                  </Link>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                  <p className="text-xs font-medium text-white/60">
                    URL de verificación para roles vinculados
                  </p>
                  <Link href="/discord/roles-vinculados" target="_blank">
                    <Button className="w-full bg-white/10 hover:bg-white/15 rounded-xl font-semibold text-[10px] tracking-widest gap-2">
                      <IconExternalLink className="size-4" />
                      Abrir verificación
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl font-semibold text-[10px] tracking-widest gap-2"
                    onClick={() => {
                      void (async () => {
                        setSyncingMetadata(true);
                        const result = await doSyncRolesMetadata();
                        if (result.success) {
                          toast.success(
                            "Metadata de roles vinculados actualizada",
                          );
                        } else {
                          toast.error(result.error);
                        }
                        setSyncingMetadata(false);
                      })();
                    }}
                    disabled={syncingMetadata}
                  >
                    {syncingMetadata
                      ? "Sincronizando..."
                      : "Sincronizar metadata"}
                  </Button>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-2xl bg-[#5865F2]/5 border border-[#5865F2]/10 text-[#5865F2]/70 shadow-inner">
                  <IconShieldLock className="size-6 shrink-0" />
                  <p className="text-[10px] font-bold tracking-widest leading-relaxed italic">
                    RECUERDA: Las credenciales se guardan encriptadas en la base
                    de datos y solo son accesibles por el Guild Master.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="roles"
          className="animate-in fade-in slide-in-from-bottom-4 duration-700 outline-none"
        >
          <Card className="bg-card/40 border-primary/10 backdrop-blur-3xl rounded-[2rem] shadow-2xl overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-bold tracking-widest text-[#5865F2]">
                    Mapeo de Rangos
                  </CardTitle>
                  <CardDescription className="text-sm font-medium text-white/40">
                    Asocia IDs de roles de Discord con roles internos de la App.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    cancelEditDiscordMapping();
                    setUi((prev) => ({ ...prev, isMappingModalOpen: true }));
                  }}
                  className="bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/20 rounded-xl px-4 h-10 font-bold text-[10px] tracking-widest  active:scale-95"
                >
                  + Añadir
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 md:p-8 pt-0">
              <div className="rounded-2xl overflow-hidden bg-zinc-950/20 border border-white/5 shadow-inner">
                <div className="hidden lg:grid grid-cols-12 bg-white/[0.03] p-6 font-semibold text-white/30 text-[10px] tracking-[0.3em] border-b border-white/[0.05]">
                  <div className="col-span-12 lg:col-span-5">Rol Discord</div>
                  <div className="col-span-12 lg:col-span-4">
                    Rango Asignado
                  </div>
                  <div className="col-span-12 lg:col-span-3"></div>
                </div>

                {discordRoles.length === 0 ? (
                  <div className="p-20 text-center flex flex-col items-center gap-4">
                    <IconShield className="size-12 text-white/5" />
                    <span className="text-zinc-500 font-bold tracking-widest text-[10px]">
                      No hay mapeos activos configurados
                    </span>
                  </div>
                ) : (
                  discordRoles
                    .toSorted((a, b) => {
                      const priority: Record<string, number> = {
                        gm: 5,
                        officer: 4,
                        raider: 3,
                        member: 2,
                        invitado: 1,
                      };
                      return (
                        (priority[b.level] || 0) - (priority[a.level] || 0)
                      );
                    })
                    .map((role) => (
                      <div
                        key={role.role_id}
                        className="flex flex-col lg:grid lg:grid-cols-12 p-5 lg:p-6 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.01] transition-colors group gap-3 lg:gap-0 items-start lg:items-center"
                      >
                        <div className="lg:col-span-5 flex flex-col gap-0.5">
                          <span className="font-semibold text-white text-base group-hover:text-[#5865F2] transition-colors leading-relaxed">
                            {role.name}
                          </span>
                          <span className="text-[9px] font-mono font-bold text-zinc-600 tracking-[0.15em]">
                            {role.role_id}
                          </span>
                        </div>

                        <div className="lg:col-span-4 py-1 lg:py-0">
                          <Badge
                            variant="outline"
                            className={`${getRoleDisplay(role.level, internalRoles).badge} px-3 py-1 rounded-xl text-[9px] font-semibold tracking-[0.15em] border-2 shadow-sm`}
                          >
                            {getRoleDisplay(role.level, internalRoles).label}
                          </Badge>
                        </div>

                        <div className="lg:col-span-3 flex justify-end gap-2.5 w-full lg:w-auto lg:translate-x-4 lg:opacity-0 lg:group-hover:opacity-100 lg:group-hover:translate-x-0 ">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Editar mapeo"
                            className="size-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 shadow-xl "
                            onClick={() => startEditDiscordMapping(role)}
                          >
                            <IconEdit className="size-4.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Eliminar mapeo"
                            className="size-10 rounded-xl border-rose-500/10 bg-rose-500/5 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20 shadow-xl "
                            onClick={() =>
                              void handleDeleteDiscordMapping(role.role_id)
                            }
                          >
                            <IconTrash className="size-4.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={ui.isMappingModalOpen}
        onOpenChange={(open) =>
          setUi((prev) => ({
            ...prev,
            isMappingModalOpen: open,
            editingRoleId: open ? prev.editingRoleId : null,
          }))
        }
      >
        <DialogContent className="max-w-md bg-zinc-950 border-white/10 text-white rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.8)] p-0 overflow-hidden">
          <DialogHeader className="p-8 pb-4">
            <DialogTitle className="text-2xl font-bold tracking-tight text-white leading-none">
              {ui.editingRoleId ? "Editar Mapeo" : "Añadir Mapeo"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 font-bold tracking-widest text-[10px] mt-2">
              Configura la relación entre Discord y la App
            </DialogDescription>
          </DialogHeader>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="discord-role-select"
                className="text-[10px] font-semibold text-white/30 ml-1 tracking-[0.2em]"
              >
                Seleccionar Rol de Discord
              </Label>
              <Select
                value={roleForm.newRoleId}
                onValueChange={(val) => {
                  setRoleForm((prev) => ({ ...prev, newRoleId: val }));
                  const selected = discordServerRoles.find((r) => r.id === val);
                  if (selected) {
                    setRoleForm((prev) => ({
                      ...prev,
                      newRoleId: val,
                      newRoleName: selected.name,
                    }));
                  }
                }}
              >
                <SelectTrigger
                  id="discord-role-select"
                  className="bg-white/5 border-white/10 h-12 text-sm font-bold rounded-xl px-4 shadow-inner outline-none focus:ring-1 focus:ring-[#5865F2]/50"
                >
                  <SelectValue
                    placeholder={
                      isLoadingRoles
                        ? "Cargando roles…"
                        : "Elige un rol de tu server"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white rounded-xl max-h-[300px]">
                  {availableDiscordRoles.map((role) => (
                    <SelectItem
                      key={role.id}
                      value={role.id}
                      className="text-[11px] font-semibold py-3"
                    >
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoadingRoles && discordServerRoles.length === 0 && (
                <p className="text-[9px] text-amber-500 italic mt-1 px-1">
                  No se pudieron cargar los roles. ¿Has configurado el Bot Token
                  correctamente?
                </p>
              )}
              {!isLoadingRoles &&
                discordServerRoles.length > 0 &&
                availableDiscordRoles.length === 0 && (
                  <p className="text-[9px] text-amber-500 italic mt-1 px-1">
                    Todos los roles del servidor ya están mapeados.
                  </p>
                )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="discord-role-name"
                className="text-[10px] font-semibold text-white/30 ml-1 tracking-[0.2em]"
              >
                Nombre del Rango (Web)
              </Label>
              <Input
                placeholder="Ej: Oficiales de Hermandad"
                id="discord-role-name"
                className="bg-white/5 border-white/10 h-12 text-sm font-bold rounded-xl px-4 focus:ring-[#5865F2]/20  font-sans"
                value={roleForm.newRoleName}
                onChange={(e) =>
                  setRoleForm((prev) => ({
                    ...prev,
                    newRoleName: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="discord-role-level"
                className="text-[10px] font-semibold text-white/30 ml-1 tracking-[0.2em]"
              >
                Nivel de Acceso Interno
              </Label>
              <Select
                value={roleForm.newRoleLevel}
                onValueChange={(val) =>
                  setRoleForm((prev) => ({
                    ...prev,
                    newRoleLevel: val as RoleLevel,
                  }))
                }
              >
                <SelectTrigger
                  id="discord-role-level"
                  className="bg-white/5 border-white/10 h-12 text-sm font-bold rounded-xl px-4 shadow-inner outline-none focus:ring-1 focus:ring-[#5865F2]/50"
                >
                  <SelectValue placeholder="Selecciona un nivel" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white rounded-xl">
                  {internalRoles.map((role) => (
                    <SelectItem
                      key={role.level}
                      value={role.level}
                      className="text-[11px] font-semibold py-3"
                    >
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="p-8 pt-0 flex gap-3">
            <Button
              variant="outline"
              onClick={cancelEditDiscordMapping}
              className="flex-1 h-12 rounded-xl border-white/10 hover:bg-white/5 font-semibold text-[10px] tracking-widest "
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveDiscordMapping()}
              disabled={ui.saving}
              className="flex-1 h-12 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold text-[10px] tracking-widest  shadow-[0_0_20px_rgba(88,101,242,0.3)]"
            >
              {ui.saving ? "Guardando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
