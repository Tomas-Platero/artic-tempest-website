import { IconBrandDiscord, IconShieldCheck } from "@/shared/ui/tabler-icons";
import { Button } from "@/shared/ui/button";
import Link from "next/link";
import { DISCORD_PUBLIC_INVITE_URL } from "@/shared/lib/discord-links";
import { RecheckMembershipButton } from "./recheck-membership-button";

/**
 * Shown when the applicant's own character is already in the guild roster: there is
 * nothing to apply for.
 */
export function AlreadyMemberScreen({ canSimulate }: { canSimulate: boolean }) {
  return (
    <div className="bg-card/20 border border-white/5 rounded-3xl p-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="size-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
        <IconShieldCheck className="size-10 text-emerald-500" />
      </div>
      <h2 className="text-2xl font-semibold text-white uppercase tracking-tight mb-4">
        Ya formas parte de nosotros
      </h2>
      <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed mb-10">
        Detectamos que ya tienes un rango activo en Artic Tempest. No es
        necesario que envíes una solicitud de reclutamiento.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <Link href="/">
          <Button
            size="lg"
            className="rounded-full font-bold px-10 h-14 active:scale-95 "
          >
            Volver a la web
          </Button>
        </Link>
        {canSimulate && (
          <>
            <Link href="/reclutamiento/apply?simulate=true">
              <Button
                variant="outline"
                size="lg"
                className="rounded-full font-bold px-10 h-14 border-white/10 hover:bg-white/5 active:scale-95 "
              >
                Simular Apply
              </Button>
            </Link>
            <Link href="/reclutamiento/apply?preview=discord">
              <Button
                variant="outline"
                size="lg"
                className="rounded-full font-bold px-10 h-14 border-white/10 hover:bg-white/5 active:scale-95 "
              >
                Ver paso de Discord
              </Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Shown when the applicant is not in the Discord server.
 *
 * Discord offers no way to bypass a user's DM privacy, so without a shared guild
 * the bot cannot notify them of anything. Being in the server is the only thing that
 * unblocks the conversation, which is why this screen exists instead of the form.
 */
export function JoinDiscordScreen({ preview = false }: { preview?: boolean }) {
  return (
    <div className="space-y-4">
      {preview && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-100">
          <strong className="font-bold uppercase tracking-[0.18em]">
            Vista previa para staff
          </strong>
          <br />
          Esto es lo que ve quien intenta aplicar sin estar en el servidor. No
          te exime de la barrera: el envío sigue bloqueado si no estás dentro.
        </div>
      )}
      <div className="bg-card/20 border border-white/5 rounded-3xl p-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="size-20 rounded-2xl bg-[#5865F2]/10 flex items-center justify-center mx-auto mb-6">
          <IconBrandDiscord className="size-10 text-[#5865F2]" />
        </div>
        <h2 className="text-2xl font-semibold text-white uppercase tracking-tight mb-4">
          Únete a nuestro Discord
        </h2>
        <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed mb-4">
          Para enviar tu solicitud es{" "}
          <strong className="text-white">obligatorio</strong> estar en el
          servidor de Discord de Artic Tempest. Es el canal por el que un
          oficial se pone en contacto contigo para la entrevista: si no estás
          dentro, no podemos escribirte y tu solicitud se queda sin respuesta.
        </p>
        <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed mb-10">
          Entra con el botón de abajo y vuelve a esta página para enviar tu
          solicitud.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={DISCORD_PUBLIC_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              size="lg"
              className="rounded-full font-bold px-10 h-14 active:scale-95 "
            >
              Entrar al servidor
            </Button>
          </a>
          {/* Recarga completa, no <Link>: ver RecheckMembershipButton. */}
          <RecheckMembershipButton />
        </div>
      </div>
    </div>
  );
}
