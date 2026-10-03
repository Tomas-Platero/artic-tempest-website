import type { Metadata } from "next";
import { auth } from '@/auth';
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { IconAlertTriangle } from "@/shared/ui/tabler-icons";
import { DISCORD_PUBLIC_INVITE_URL } from "@/shared/lib/discord-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Cuenta baneada | Artic Tempest",
  description: "Información sobre el bloqueo temporal o permanente de tu cuenta.",
};

export default async function BannedPage() {
  const session = await auth();
  const reason =
    session?.user?.banReason || "Incumplimiento de las normas internas.";
  const banExpiresAt = session?.user?.banExpiresAt
    ? new Date(session.user.banExpiresAt).toLocaleString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-20 bg-linear-to-b from-zinc-950 via-zinc-950/90 to-zinc-900">
      <div className="max-w-2xl w-full bg-zinc-950/60 border border-white/10 rounded-3xl p-10 text-white shadow-[0_25px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
            <IconAlertTriangle className="size-8" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-400/70">
              Acceso restringido
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Tu cuenta ha sido baneada
            </h1>
          </div>
        </div>

        <p className="text-base text-white/80 leading-relaxed">
          El acceso al panel está bloqueado temporalmente. Si crees que se trata
          de un error o necesitas más detalles, ponte en contacto con el equipo
          de oficiales.
        </p>

        <div className="mt-6 p-5 rounded-2xl bg-white/5 border border-white/10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40 font-semibold mb-2">
            Motivo del baneo
          </p>
          <p className="text-sm font-semibold text-white/90">{reason}</p>
          {banExpiresAt ? (
            <p className="text-xs text-white/60 mt-4">
              Expira el{" "}
              <span className="font-semibold text-white">{banExpiresAt}</span>
            </p>
          ) : (
            <p className="text-xs text-white/60 mt-4">
              Baneo permanente hasta nueva revisión.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-white text-black hover:bg-white/90">
            <Link href="/" prefetch={false}>
              Volver al inicio
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
          >
            <a
              href={DISCORD_PUBLIC_INVITE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Contactar con oficiales
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
