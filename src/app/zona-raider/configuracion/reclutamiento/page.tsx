import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { RecruitmentSettingsClient } from "@/domains/settings/components/recruitment/recruitment-settings-client";
import { Suspense } from "react";
import { IconArrowLeft } from "@/shared/ui/tabler-icons";
import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { attachInterviewReplySignals } from "@/shared/lib/recruitment/application-chat-signals";
import { loadInterviewQueue } from "@/shared/lib/recruitment/interview-queue";
import { fetchCharacterRIO } from "@/shared/integrations/raiderio/raiderio-client";

import { Forbidden } from "@/shared/components/forbidden";
import { getAppPermission } from "@/shared/auth/permissions";
import { SpinnerFallback } from "@/shared/ui/skeletons";

/** Enrich applications with RIO guild info (non-blocking, best-effort) */
async function enrichWithRioGuilds(apps: any[]): Promise<any[]> {
  const results = await Promise.allSettled(
    apps.map(async (app) => {
      if (!app.character_name || !app.character_realm)
        return { ...app, rio_guild: null };
      const rio = await fetchCharacterRIO(
        app.character_name,
        app.character_realm,
      );
      return { ...app, rio_guild: rio?.guild ?? null };
    }),
  );

  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ...apps[i], rio_guild: null },
  );
}

export default async function RecruitmentSettingsPage() {
  const session = await getCachedServerSession();
  const roleLevel = session?.user?.roleLevel ?? "member";
  const { canView } = await getAppPermission(roleLevel, "settings-recruitment");

  if (!canView) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6 lg:px-8">
        <Forbidden />
      </div>
    );
  }

  const [
    { data: spots },
    { data: questions },
    { data: constants },
    { data: applications },
    interviewQueue,
  ] = await Promise.all([
    supabaseAdmin.from("recruitment_spots").select("*"),
    supabaseAdmin
      .from("recruitment_questions")
      .select("*")
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("game_constants")
      .select("*")
      .in("category", ["wow_class", "spec_role"]),
    supabaseAdmin
      .from("recruitment_applications")
      .select("*")
      .order("created_at", { ascending: false }),
    // Se carga siempre, no solo al pedir la pestaña: el cambio de pestaña es
    // client-side sin re-fetch, así que el dato tiene que estar en el 1er render.
    loadInterviewQueue(),
  ]);

  const applicationList = applications || [];

  // Enrich with RIO guild data in the background
  const enrichedApps = await enrichWithRioGuilds(applicationList);

  const applicationIds = applicationList.map((application) => application.id);
  const { data: messages } = applicationIds.length
    ? await supabaseAdmin
        .from("application_messages")
        .select("application_id, author_id, created_at")
        .in("application_id", applicationIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const applicationsWithSignals = attachInterviewReplySignals(
    enrichedApps,
    messages || [],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:px-8">
      <div className="flex items-center gap-4">
        <Link href="/zona-raider/configuracion">
          <Button
            variant="outline"
            size="icon"
            aria-label="Volver a configuración"
            className="size-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10  shadow-xl"
          >
            <IconArrowLeft className="size-6" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold font-heading italic tracking-tight flex items-center gap-3">
            AJUSTES DE RECLUTAMIENTO
          </h1>
          <p className="text-sm font-medium text-white/40 mt-2 tracking-widest leading-relaxed">
            Gestiona las vacantes de la hermandad, las preguntas y revisa las
            nuevas solicitudes.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <SpinnerFallback label="Cargando gestión de reclutamiento…" />
        }
      >
        <RecruitmentSettingsClient
          initialSpots={spots || []}
          initialQuestions={questions || []}
          constants={constants || []}
          applications={applicationsWithSignals}
          interviewQueue={interviewQueue}
          currentRoleLevel={roleLevel}
        />
      </Suspense>
    </div>
  );
}
