import { getCachedServerSession } from "@/shared/auth/get-cached-server-session";
import { supabaseAdmin } from "@/shared/lib/supabase-admin";
import { notFound, redirect } from "next/navigation";
import { RecruitmentDetailClient } from "@/domains/recruitment/components/recruitment-detail-client";
import { Button } from "@/shared/ui/button";
import { IconArrowLeft } from "@/shared/ui/tabler-icons";
import Link from "next/link";
import { fetchCharacterRIO } from "@/shared/integrations/raiderio/raiderio-client";
import { fetchCharacterItemLevel } from "@/shared/integrations/bnet/bnet-client";
import { getAppPermission } from "@/shared/auth/permissions";
import { getAuthzSnapshot } from "@/shared/auth/authz";
import { Forbidden } from "@/shared/components/forbidden";

export default async function ApplicationDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const [{ id }, session] = await Promise.all([
		params,
		getCachedServerSession(),
	]);
	if (!session) {
		redirect("/");
	}

	const authz = await getAuthzSnapshot(session);
	const { canEdit } = await getAppPermission(
		authz.roleSlug ?? session.user?.roleLevel ?? "invitado",
		"settings-recruitment",
	);
	if (!canEdit) {
		return <Forbidden />;
	}

	// Fetch the application
	const { data: application } = await supabaseAdmin
		.from("recruitment_applications")
		.select("*")
		.eq("id", id)
		.single();

	if (!application) notFound();

	const [{ data: answers }, { data: classConstants }] = await Promise.all([
		supabaseAdmin
			.from("application_answers")
			.select("*, recruitment_questions(*)")
			.eq("application_id", id),
		supabaseAdmin.from("game_constants").select("*").eq("category", "wow_class"),
	]);

	// Fetch Raider.io data on the server to avoid CORS
	const charName = application.character_name.trim();
	const charRealm = application.character_realm.trim();

	const [rioData, bnetData] = await Promise.all([
		fetchCharacterRIO(charName, charRealm),
		fetchCharacterItemLevel(charRealm, charName),
	]);
	return (
		<div className="flex min-size-full max-w-full flex-col gap-6 p-4 md:p-6 lg:px-8">
			<div className="flex items-center gap-6">
				<Link href="/zona-raider/configuracion/reclutamiento?tab=inbox">
					<Button
						variant="outline"
						size="icon"
						aria-label="Volver a reclutamiento"
						className="size-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10  shadow-xl"
					>
						<IconArrowLeft className="size-6" />
					</Button>
				</Link>
				<div>
					<h1 className="text-3xl font-semibold font-heading italic tracking-tight uppercase flex items-center gap-3">
						DETALLE DE SOLICITUD
					</h1>
					<p className="text-sm font-medium text-white/40 mt-2 tracking-widest">
						Revisa la información del aplicante y gestiona su estado.
					</p>
				</div>
			</div>

			<RecruitmentDetailClient
				application={application}
				answers={answers || []}
				classConstants={classConstants || []}
				initialRioData={rioData}
				initialBnetData={bnetData}
			/>
		</div>
	);
}
