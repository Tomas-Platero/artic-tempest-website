"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconMessageCircle,
  IconUserPlus,
} from "@/shared/ui/tabler-icons";
import {
  DELIVERY_TONE_CLASSES,
  describeDelivery,
} from "@/shared/lib/recruitment/delivery-status";
import type { InterviewQueueItem } from "@/shared/lib/recruitment/interview-queue";

const statusDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function StatusDate({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning>
      {statusDateFormatter.format(new Date(iso))}
    </span>
  );
}

async function requestInvite(
  applicationId: string,
): Promise<{ ok: true; inviteUrl: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/recruitment/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    });

    // `fetch` resolves on 4xx/5xx, so the status is checked before the body is
    // read; otherwise an error payload would be parsed as a success.
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        error:
          (err as { error?: string })?.error ??
          "No se pudo crear la invitación",
      };
    }

    const json = (await res.json().catch(() => ({}))) as {
      inviteUrl?: string;
    };

    if (!json.inviteUrl) {
      return {
        ok: false,
        error: "Discord no devolvió un enlace de invitación",
      };
    }

    return { ok: true, inviteUrl: json.inviteUrl };
  } catch (error: any) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo crear la invitación",
    };
  }
}

export function RecruitmentInterviews({
  items,
  constants,
}: {
  items: InterviewQueueItem[];
  constants: any[];
}) {
  const [inviteState, setInviteState] = useState<{
    pendingId: string | null;
    urls: Record<string, string>;
  }>({ pendingId: null, urls: {} });

  const classMap = new Map<number, { name: string; color: string }>();
  for (const constant of constants) {
    if (constant.category !== "wow_class") continue;
    classMap.set(Number(constant.key), {
      name: constant.value,
      color: constant.metadata?.color,
    });
  }

  const handleInvite = async (applicationId: string) => {
    setInviteState((prev) => ({ ...prev, pendingId: applicationId }));

    const result = await requestInvite(applicationId);

    if (!result.ok) {
      toast.error("No se pudo crear la invitación", {
        description: result.error,
      });
      setInviteState((prev) => ({ ...prev, pendingId: null }));
      return;
    }

    toast.success("Invitación creada", {
      description: "Es de un solo uso y caduca en 7 días",
    });
    setInviteState((prev) => ({
      pendingId: null,
      urls: { ...prev.urls, [applicationId]: result.inviteUrl },
    }));
  };

  if (items.length === 0) {
    return (
      <div className="py-20 text-center space-y-4 bg-zinc-950/20 border border-dashed border-white/5 rounded-3xl">
        <IconMessageCircle className="size-12 text-zinc-700 mx-auto" />
        <div>
          <p className="text-zinc-400 font-bold">
            No hay candidaturas en entrevista
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Cuando muevas una solicitud a Entrevista aparecerá aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const cls = item.characterClass
          ? classMap.get(item.characterClass)
          : undefined;
        const delivery = describeDelivery(item.lastStaffDelivery);
        const inviteUrl = inviteState.urls[item.applicationId];
        const isInviting = inviteState.pendingId === item.applicationId;

        return (
          <div
            key={item.applicationId}
            className="rounded-2xl border border-white/8 bg-zinc-950/40 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)]"
          >
            <div className="flex items-start gap-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-lg">
                <Image
                  src={`/assets/images/classes/${item.characterClass ?? 0}.webp`}
                  alt="Clase"
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-white truncate">
                    {item.characterName}
                  </h3>
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                    {item.daysInPhase === 0
                      ? "Entrevista hoy"
                      : `${item.daysInPhase} día${item.daysInPhase === 1 ? "" : "s"} en entrevista`}
                  </span>
                  {item.awaitingStaffReply && (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                      Espera respuesta
                    </span>
                  )}
                </div>

                <p
                  className="text-xs font-medium truncate"
                  style={{ color: cls?.color }}
                >
                  {item.characterSpec} {cls?.name} · {item.characterRealm}
                </p>

                {item.lastMessage ? (
                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {item.awaitingStaffReply ? "Aplicante" : "Staff"}:{" "}
                    {item.lastMessage.content}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-600 italic">
                    Sin mensajes todavía
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${DELIVERY_TONE_CLASSES[delivery.tone]}`}
                    title={delivery.detail}
                  >
                    Último aviso: {delivery.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${DELIVERY_TONE_CLASSES[item.reachability.tone]}`}
                    title={item.reachability.detail}
                  >
                    {item.reachability.reachable === false && (
                      <IconAlertTriangle className="size-3" />
                    )}
                    {item.reachability.reachable === true && (
                      <IconCheck className="size-3" />
                    )}
                    {item.reachability.label}
                  </span>
                  {item.lastMessage && (
                    <span className="text-zinc-500">
                      <StatusDate iso={item.lastMessage.createdAt} />
                    </span>
                  )}
                </div>

                {inviteUrl && (
                  <p className="text-[11px] text-blue-200 break-all">
                    Invitación de un solo uso:{" "}
                    <a
                      href={inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline underline-offset-4"
                    >
                      {inviteUrl}
                    </a>
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <Link
                  href={`/zona-raider/configuracion/reclutamiento/${item.applicationId}/chat`}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-2 rounded-xl border-white/10 bg-white/5 text-xs hover:bg-blue-500 hover:text-white"
                  >
                    <IconExternalLink className="size-4" />
                    <span className="hidden sm:inline">Abrir chat</span>
                  </Button>
                </Link>

                {item.reachability.reachable === false && !inviteUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isInviting}
                    onClick={() => void handleInvite(item.applicationId)}
                    className="w-full justify-center gap-2 rounded-xl border-amber-500/20 bg-amber-500/10 text-xs text-amber-200 hover:bg-amber-500 hover:text-black"
                  >
                    <IconUserPlus className="size-4" />
                    <span className="hidden sm:inline">Generar invitación</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
