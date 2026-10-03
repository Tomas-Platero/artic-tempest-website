"use client";

import { Suspense } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  IconUsers,
  IconForms,
  IconInbox,
  IconMessageCircle,
} from "@/shared/ui/tabler-icons";
import { SpotsManager } from "@/domains/settings/components/recruitment/spots-manager";
import { FormBuilder } from "@/domains/settings/components/recruitment/form-builder";
import { RecruitmentInbox } from "@/domains/settings/components/recruitment/recruitment-inbox";
import { RecruitmentInterviews } from "@/domains/settings/components/recruitment/recruitment-interviews";
import { useSearchParams } from "next/navigation";

const RECRUITMENT_TABS = ["spots", "form", "inbox", "entrevistas"] as const;
const DEFAULT_RECRUITMENT_TAB: (typeof RECRUITMENT_TABS)[number] = "spots";

function resolveRecruitmentTab(
  value: string | null | undefined,
): (typeof RECRUITMENT_TABS)[number] | null {
  if (!value) return null;
  return (RECRUITMENT_TABS as readonly string[]).includes(value)
    ? (value as (typeof RECRUITMENT_TABS)[number])
    : null;
}

function RecruitmentSettingsClientContent({
  initialSpots,
  initialQuestions,
  constants,
  applications,
  interviewQueue,
  currentRoleLevel,
}: any) {
  const searchParams = useSearchParams();
  const activeTab =
    resolveRecruitmentTab(searchParams.get("tab")) ?? DEFAULT_RECRUITMENT_TAB;

  // Los enlaces con `?tab=...` (badge de reclutes del menú público y de la Zona
  // Raider) deben abrir siempre la pestaña indicada, también cuando la navegación
  // ocurre dentro de la misma ruta (client-side), donde `defaultValue` no se reaplica.
  // Al cambiar de pestaña sincronizamos la query con la History API (integrada en el
  // router de Next.js, sin re-fetch) para que la URL refleje la pestaña activa.
  const handleTabChange = (value: string) => {
    const nextTab = resolveRecruitmentTab(value);
    if (!nextTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="bg-muted/50 p-1 w-full grid grid-cols-4 gap-1 rounded-2xl md:flex md:justify-start md:overflow-x-auto md:no-scrollbar md:scrollbar-hide md:h-auto md:min-h-12 md:py-1 md:flex-nowrap md:touch-pan-x">
        <TabsTrigger
          value="spots"
          className="gap-2 min-w-0 px-2 md:px-3 md:shrink-0"
        >
          <IconUsers className="size-4" />
          <span className="hidden sm:inline">Vacantes de Clase</span>
        </TabsTrigger>
        <TabsTrigger
          value="form"
          className="gap-2 min-w-0 px-2 md:px-3 md:shrink-0"
        >
          <IconForms className="size-4" />
          <span className="hidden sm:inline">Constructor de Formulario</span>
        </TabsTrigger>
        <TabsTrigger
          value="inbox"
          className="gap-2 min-w-0 px-2 md:px-3 md:shrink-0"
        >
          <IconInbox className="size-4" />
          <span className="hidden sm:inline">Bandeja de Entrada</span>
        </TabsTrigger>
        <TabsTrigger
          value="entrevistas"
          className="gap-2 min-w-0 px-2 md:px-3 md:shrink-0"
        >
          <IconMessageCircle className="size-4" />
          <span className="hidden sm:inline">Entrevistas</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="spots" className="mt-6">
        <SpotsManager initialSpots={initialSpots} constants={constants} />
      </TabsContent>

      <TabsContent value="form" className="mt-6">
        <FormBuilder initialQuestions={initialQuestions} />
      </TabsContent>

      <TabsContent value="inbox" className="mt-6">
        <RecruitmentInbox
          applications={applications}
          constants={constants}
          currentRoleLevel={currentRoleLevel}
        />
      </TabsContent>

      <TabsContent value="entrevistas" className="mt-6">
        <RecruitmentInterviews items={interviewQueue} constants={constants} />
      </TabsContent>
    </Tabs>
  );
}

export function RecruitmentSettingsClient(props: any) {
  return (
    <Suspense fallback={null}>
      <RecruitmentSettingsClientContent {...props} />
    </Suspense>
  );
}
