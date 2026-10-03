import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { redirect } from "next/navigation";
import { LandingNavigation } from "@/domains/landing/components/navigation";
import { LandingFooter } from "@/domains/landing/components/footer";
import { ApplyClient } from "@/domains/recruitment/components/apply-client";
import { toSlug } from "@/shared/integrations/bnet/bnet-client";
import { ACTIVE_RECRUITMENT_STATUSES } from "@/domains/recruitment/lib/application-status";
import { getAuthzSnapshot } from "@/shared/auth/authz";
import {
  resolveUserMembershipGate,
  type MembershipGateDecision,
} from "@/shared/lib/recruitment/discord-membership";
import {
  AlreadyMemberScreen,
  JoinDiscordScreen,
} from "./_components/apply-screens";

export const metadata: Metadata = {
  title: "Solicitar ingreso | Artic Tempest",
  description:
    "Formulario para unirte al proceso de reclutamiento de Artic Tempest.",
};

type AppSession = NonNullable<Awaited<ReturnType<typeof auth>>>;

function firstOrNull<T>(items: T[] | null | undefined): T | null {
  return items && items.length > 0 ? (items[0] ?? null) : null;
}

function resolveList<T>(items: T[] | null | undefined): T[] {
  return items ?? [];
}

function resolveHasGuildCharacter({
  profileMatchCount,
  characterIdMatchCount,
  nameMatches,
  characterKeys,
}: {
  profileMatchCount?: number;
  characterIdMatchCount?: number;
  nameMatches?: Array<{
    character_name?: string | null;
    realm_slug?: string | null;
  }> | null;
  characterKeys: Set<string>;
}) {
  return (
    Boolean(profileMatchCount) ||
    Boolean(characterIdMatchCount) ||
    Boolean(
      nameMatches?.some((member) => {
        const key = `${member.character_name?.trim().toLowerCase()}::${member.realm_slug?.trim().toLowerCase()}`;
        return characterKeys.has(key);
      }),
    )
  );
}

function resolveIsMember({
  hasGuildCharacter,
  canSimulate,
  simulate,
}: {
  hasGuildCharacter: boolean;
  canSimulate: boolean;
  simulate?: string;
}) {
  return hasGuildCharacter && !(canSimulate && simulate === "true");
}

type GuildMatch = { data: Array<{ id: string }> | null };
type GuildNameMatch = {
  data: Array<{
    character_name?: string | null;
    realm_slug?: string | null;
  }> | null;
};

/**
 * Everything the page needs, gathered in one place.
 *
 * Split out of the component so the render reads as a decision instead of as a
 * sequence of queries, and so the two membership rules can be read side by side.
 */
async function loadApplyPageData(session: AppSession, simulate?: string) {
  const [
    { data: existingApps },
    { data: bnetCharacters },
    { data: questions },
    { data: classConstants },
  ] = await Promise.all([
    supabaseAdmin
      .from("recruitment_applications")
      .select("id, status, created_at")
      .eq("user_id", session.user.id)
      .in("status", [...ACTIVE_RECRUITMENT_STATUSES])
      .limit(1),
    supabaseAdmin
      .from("bnet_characters")
      .select("id, name, realm, realm_slug, class_id, level, spec")
      .eq("user_id", session.user.id)
      .order("level", { ascending: false }),
    supabaseAdmin
      .from("recruitment_questions")
      .select("*")
      .order("order_index", { ascending: true }),
    supabaseAdmin
      .from("game_constants")
      .select("key, value")
      .eq("category", "wow_class"),
  ]);

  const characters = bnetCharacters || [];
  const authz = await getAuthzSnapshot(session);
  const canSimulate = authz.route.internalAdmin;

  // Primera barrera: ¿su personaje ya está en el roster de la hermandad?
  const characterKeys = new Set(
    characters.map((character) => {
      const realmSlug =
        character.realm_slug ||
        (typeof character.realm === "string" ? toSlug(character.realm) : "");
      return `${character.name?.trim().toLowerCase()}::${realmSlug.trim().toLowerCase()}`;
    }),
  );

  const characterIds: string[] = [];
  const characterNameSet = new Set<string>();
  for (const character of characters) {
    if (character.id) characterIds.push(character.id);
    const trimmedName = character.name?.trim();
    if (trimmedName) characterNameSet.add(trimmedName);
  }
  const characterNames = [...characterNameSet];

  const [guildProfileMatch, guildCharacterIdMatch, guildNameMatch] =
    await Promise.all([
      supabaseAdmin
        .from("guild_members")
        .select("id")
        .eq("profile_id", session.user.id)
        .limit(1),
      characterIds.length > 0
        ? supabaseAdmin
            .from("guild_members")
            .select("id")
            .in("bnet_character_id", characterIds)
            .limit(1)
        : Promise.resolve({ data: null }),
      characterNames.length > 0
        ? supabaseAdmin
            .from("guild_members")
            .select("character_name, realm_slug")
            .in("character_name", characterNames)
        : Promise.resolve({ data: null }),
    ]);

  const hasGuildCharacter = resolveHasGuildCharacter({
    profileMatchCount: (guildProfileMatch as GuildMatch).data?.length,
    characterIdMatchCount: (guildCharacterIdMatch as GuildMatch).data?.length,
    nameMatches: (guildNameMatch as GuildNameMatch).data,
    characterKeys,
  });

  // Saltar la comprobación de roster solo con permiso de simular Y ?simulate=true.
  const isMember = resolveIsMember({
    hasGuildCharacter,
    canSimulate,
    simulate,
  });

  // Segunda barrera, independiente: Discord no permite saltarse la privacidad de DMs
  // de un usuario, así que sin servidor en común el bot no puede avisarle de nada
  // (medido: 3/3 dentro del servidor recibieron su DM, 0/4 fuera). Solo se consulta a
  // quien va a ver el formulario, no a quien ya es del roster.
  let discordGate: MembershipGateDecision = { allowed: true, reason: "member" };

  if (!isMember) {
    discordGate = await resolveUserMembershipGate({
      userId: session.user.id,
      isTest: false,
    });
  }

  return {
    existingApp: firstOrNull(existingApps),
    characters,
    questions,
    classConstants,
    canSimulate,
    isMember,
    discordGate,
  };
}

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const [{ simulate }, session] = await Promise.all([searchParams, auth()]);

  if (!session) {
    redirect(
      `/login?redirectPath=${encodeURIComponent("/reclutamiento/apply")}`,
    );
  }

  const data = await loadApplyPageData(session, simulate);

  // Un miembro del roster no envía solicitud; si además ya tiene una en curso, se le
  // lleva a su estado en vez de a la pantalla informativa.
  if (!data.isMember && data.existingApp) {
    redirect("/reclutamiento/apply-en-curso");
  }

  let content: ReactNode;

  if (data.isMember) {
    content = <AlreadyMemberScreen canSimulate={data.canSimulate} />;
  } else if (!data.discordGate.allowed) {
    content = <JoinDiscordScreen />;
  } else {
    content = (
      <ApplyClient
        user={session.user}
        characters={resolveList(data.characters)}
        questions={resolveList(data.questions)}
        classConstants={resolveList(data.classConstants)}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col animate-fade-in animate-duration-slow motion-reduce:animate-none">
      <LandingNavigation />
      <main id="main-content" className="flex-1">
        <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
          <div className="mb-10 text-center md:text-left">
            <h1 className="text-3xl font-semibold text-white uppercase tracking-tight">
              Formulario de Aplicación
            </h1>
            <p className="text-white/60 mt-2">
              Completa todos los campos para enviar tu solicitud a los oficiales
              de Artic Tempest.
            </p>
          </div>

          {content}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
