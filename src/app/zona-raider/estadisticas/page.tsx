// src/app/zona-raider/estadisticas/page.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { supabaseAdmin } from '@/shared/lib/supabase-admin';
import { getAppPermission } from "@/shared/auth/permissions";
import { getAuthzSnapshot } from "@/shared/auth/authz";

import { StatsClient } from "@/domains/stats/components/stats-client";
import { getMainCharacterPerformance } from "./performance-data";
import { RAIDER_PAGE_FADE_IN_CLASSES } from "@/shared/components/raider-motion";
import { PageFallback } from "@/shared/ui/skeletons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Estadísticas | Zona Raider",
  description: "Estadísticas de rendimiento de los raiders de Artic Tempest.",
  robots: { index: false, follow: false },
};

async function getRoster() {
  const [membersResult, ranksResult] = await Promise.all([
    supabaseAdmin
      .from("guild_members")
      .select("id, character_name, realm_slug, class_id, role, rank")
      .order("character_name", { ascending: true }),
    supabaseAdmin.from("guild_ranks").select("rank, is_visible"),
  ]);

  const { data: members } = membersResult;
  const rawRanks = ranksResult.data;

  // Build a map of rank visibility from the database
  const visibilityMap: Record<number, boolean> = {};
  rawRanks?.forEach((r) => {
    visibilityMap[r.rank] = r.is_visible;
  });

  // Filter members based on the visibility map (default to true if not configured)
  const filteredRoster = (members ?? []).filter((m) => {
    const rankValue = Number(m.rank);
    const isVisible = visibilityMap[rankValue] ?? true;
    return isVisible;
  });

  return filteredRoster.map((m) => ({
    ...m,
    character_realm: m.realm_slug,
  }));
}

export default async function EstadisticasPage() {
  const session = await getCachedServerSession();
  if (!session) {
    redirect("/");
  }

  const authz = await getAuthzSnapshot(session);
  const roleLevel = authz.roleSlug ?? session.user?.roleLevel ?? "member";
  const { canView } = await getAppPermission(roleLevel, "stats");

  if (!canView) {
    redirect("/zona-raider");
  }

  const [roster, performanceData, { data: colorConstants }] = await Promise.all(
    [
      getRoster(),
      getMainCharacterPerformance(session.user.id),
      supabaseAdmin
        .from("game_constants")
        .select("key, value")
        .eq("category", "wow_class_color"),
    ],
  );

  const classColors: Record<number, string> = {};
  colorConstants?.forEach((c) => {
    classColors[Number(c.key)] = c.value;
  });

  return (
    <div
      className={`flex w-full flex-1 flex-col gap-6 px-4 py-6 lg:px-6 ${RAIDER_PAGE_FADE_IN_CLASSES}`}
      data-tour-step="stats-page"
    >
      <Suspense fallback={<PageFallback />}>
        <StatsClient
          members={roster}
          classColors={classColors}
          performanceData={performanceData}
        />
      </Suspense>
    </div>
  );
}
