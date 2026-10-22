"use client";

import Link from "next/link";
import { useState } from "react";
import { useSWRConfig } from "swr";
import type { AppRole } from "@/shared/types/auth";
import { Button } from "@/shared/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";

import {
	IconChevronRight,
	IconPlus,
	IconArrowUp,
	IconArrowDown,
} from "@/shared/ui/tabler-icons";
import { cn } from "@/shared/tailwind/tailwind-utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";

type RolesListClientProps = {
	roles: AppRole[];
};

type RoleActionsProps = {
	role: AppRole;
	processingRole: string | null;
	orderedRoles: AppRole[];
	onMove: (level: string, direction: "up" | "down") => void;
	onDelete: (role: AppRole) => void;
	compact?: boolean;
};

function RoleActions({
	role,
	processingRole,
	orderedRoles,
	onMove,
	onDelete,
	compact = false,
}: RoleActionsProps) {
	const isProcessing = processingRole === role.level;

	return (
		<div className={cn("flex gap-2 flex-wrap", compact ? "" : "justify-end")}>
			{!compact && (
				<>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 text-white/70 hover:text-white"
						onClick={() => onMove(role.level, "up")}
						disabled={isProcessing || orderedRoles[0]?.level === role.level}
						aria-label={`Mover ${role.label} hacia arriba`}
					>
						<IconArrowUp className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 text-white/70 hover:text-white"
						onClick={() => onMove(role.level, "down")}
						disabled={
							isProcessing ||
							orderedRoles[orderedRoles.length - 1]?.level === role.level
						}
						aria-label={`Mover ${role.label} hacia abajo`}
					>
						<IconArrowDown className="size-4" />
					</Button>
				</>
			)}
			<Button
				asChild
				variant={compact ? "outline" : "ghost"}
				className={cn(
					compact ? "flex-1" : "gap-2 text-white/80 hover:text-white",
				)}
				disabled={isProcessing}
			>
				<Link
					href={`/zona-raider/configuracion/roles/${encodeURIComponent(role.level)}`}
					aria-label={`Editar el rol ${role.label}`}
				>
					Editar
					{!compact && <IconChevronRight className="size-4" />}
				</Link>
			</Button>
			<Button
				asChild
				variant="outline"
				className={cn(compact ? "flex-1" : "gap-2 text-white/80")}
				disabled={isProcessing}
			>
				<Link
					href={`/zona-raider/configuracion/roles/nuevo?template=${encodeURIComponent(role.level)}`}
					aria-label={`Duplicar rol ${role.label}`}
				>
					Duplicar
					{!compact && <IconPlus className="size-4" />}
				</Link>
			</Button>
			<Button
				variant="destructive"
				className={cn(compact ? "w-full" : "gap-2")}
				disabled={isProcessing || ["gm", "invitado"].includes(role.level)}
				onClick={() => onDelete(role)}
			>
				Eliminar
			</Button>
		</div>
	);
}

type DesktopRolesTableProps = {
	roles: AppRole[];
	processingRole: string | null;
	onMove: (level: string, direction: "up" | "down") => void;
	onDelete: (role: AppRole) => void;
};

function DesktopRolesTable({
	roles,
	processingRole,
	onMove,
	onDelete,
}: DesktopRolesTableProps) {
	return (
		<div className="hidden md:block border border-white/10 bg-zinc-950/40 backdrop-blur-xl shadow-2xl overflow-hidden">
			<Table>
				<TableHeader className="bg-white/[0.03]">
					<TableRow className="border-white/5">
						<TableHead className="text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Rol
						</TableHead>
						<TableHead className="text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Identificador
						</TableHead>
						<TableHead className="text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Acceso Zona Raider
						</TableHead>

						<TableHead className="text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Admin
						</TableHead>
						<TableHead className="text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Super Admin
						</TableHead>
						<TableHead className="text-right text-white/60 uppercase tracking-[0.3em] text-[11px] px-6 py-4">
							Acciones
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{roles.map((role) => (
						<TableRow key={role.level} className="border-white/5">
							<TableCell className="px-6 py-5">
								<div className="flex items-center gap-2">
									<span
										className="text-base font-semibold text-white"
										style={{ color: role.color }}
									>
										{role.label}
									</span>
									<Badge
										variant="outline"
										className="uppercase tracking-[0.3em]"
									>
										{role.level}
									</Badge>
								</div>
								<p className="text-xs text-white/40 mt-1">
									{role.description || "Sin descripción"}
								</p>
							</TableCell>
							<TableCell className="font-mono text-sm text-white/70 px-6 py-5">
								{role.level}
							</TableCell>
							<TableCell className="px-6 py-5">
								<Badge
									className={cn(
										"border px-3",
										role.can_access_zona_raider
											? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
											: "bg-white/5 text-white/50 border-white/10",
									)}
								>
									{role.can_access_zona_raider ? "Permitido" : "Bloqueado"}
								</Badge>
							</TableCell>

							<TableCell className="px-6 py-5">
								<Badge
									className={cn(
										"border px-3",
										role.is_admin
											? "bg-sky-500/20 text-sky-200 border-sky-500/40"
											: "bg-white/5 text-white/50 border-white/10",
									)}
								>
									{role.is_admin ? "Sí" : "No"}
								</Badge>
							</TableCell>
							<TableCell className="px-6 py-5">
								<Badge
									className={cn(
										"border px-3",
										role.is_super_admin
											? "bg-rose-500/20 text-rose-200 border-rose-500/40"
											: "bg-white/5 text-white/50 border-white/10",
									)}
								>
									{role.is_super_admin ? "Sí" : "No"}
								</Badge>
							</TableCell>
							<TableCell className="text-right px-6 py-5">
								<RoleActions
									role={role}
									processingRole={processingRole}
									orderedRoles={roles}
									onMove={onMove}
									onDelete={onDelete}
								/>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

type MobileRolesCardsProps = {
	roles: AppRole[];
	processingRole: string | null;
	onDelete: (role: AppRole) => void;
};

function MobileRolesCards({
	roles,
	processingRole,
	onDelete,
}: MobileRolesCardsProps) {
	return (
		<div className="md:hidden space-y-3">
			{roles.map((role) => (
				<div
					key={role.level}
					className="rounded-3xl border border-white/10 bg-zinc-950/50 p-4 space-y-3"
				>
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<span
								className="text-lg font-semibold"
								style={{ color: role.color }}
							>
								{role.label}
							</span>
							<Badge variant="outline" className="uppercase tracking-[0.3em]">
								{role.level}
							</Badge>
						</div>
						<p className="text-xs text-white/60">
							{role.description || "Sin descripción"}
						</p>
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-white/60">Zona Raider</span>
						<Badge
							className={cn(
								"border px-3",
								role.can_access_zona_raider
									? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
									: "bg-white/5 text-white/50 border-white/10",
							)}
						>
							{role.can_access_zona_raider ? "Permitido" : "Bloqueado"}
						</Badge>
					</div>

					<div className="flex items-center justify-between text-sm">
						<span className="text-white/60">Admin</span>
						<Badge
							className={cn(
								"border px-3",
								role.is_admin
									? "bg-sky-500/20 text-sky-200 border-sky-500/40"
									: "bg-white/5 text-white/50 border-white/10",
							)}
						>
							{role.is_admin ? "Sí" : "No"}
						</Badge>
					</div>
					<div className="flex items-center justify-between text-sm">
						<span className="text-white/60">Super Admin</span>
						<Badge
							className={cn(
								"border px-3",
								role.is_super_admin
									? "bg-rose-500/20 text-rose-200 border-rose-500/40"
									: "bg-white/5 text-white/50 border-white/10",
							)}
						>
							{role.is_super_admin ? "Sí" : "No"}
						</Badge>
					</div>
					<RoleActions
						role={role}
						processingRole={processingRole}
						orderedRoles={roles}
						onMove={() => undefined}
						onDelete={onDelete}
						compact
					/>
				</div>
			))}
		</div>
	);
}

type DeleteRoleDialogProps = {
	roleToDelete: AppRole | null;
	deletingRole: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirmDelete: () => Promise<void>;
	onCancel: () => void;
};

function DeleteRoleDialog({
	roleToDelete,
	deletingRole,
	onOpenChange,
	onConfirmDelete,
	onCancel,
}: DeleteRoleDialogProps) {
	return (
		<Dialog open={Boolean(roleToDelete)} onOpenChange={onOpenChange}>
			<DialogContent className="bg-[#0a0a12]/95 border border-white/10 text-white">
				<DialogHeader>
					<DialogTitle className="text-xl font-semibold uppercase tracking-[0.3em] text-rose-400">
						¿Eliminar rol?
					</DialogTitle>
					<DialogDescription className="text-white/70">
						Cualquier usuario con este rol se convertirá en Invitado. Esta
						acción no se puede deshacer.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button variant="ghost" onClick={onCancel} disabled={deletingRole}>
						Cancelar
					</Button>
					<Button
						variant="destructive"
						disabled={deletingRole}
						onClick={() => void onConfirmDelete()}
					>
						{deletingRole ? "Eliminando..." : "Eliminar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

async function swapPriorities(
	primary: AppRole,
	secondary: AppRole,
): Promise<boolean> {
	const payloads = [
		{ ...primary, priority: secondary.priority },
		{ ...secondary, priority: primary.priority },
	];

	try {
		await Promise.all(
			payloads.map((role) =>
				fetch(`/api/guild/roles/${role.level}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						label: role.label,
						description: role.description,
						priority: role.priority,
						color: role.color,
						canAccessZonaRaider: role.can_access_zona_raider,
						isSuperAdmin: role.is_super_admin,
						isAdmin: role.is_admin,
					}),
				}),
			),
		);
		return true;
	} catch (error) {
		console.error("Error reordenando roles", error);
		return false;
	}
}

async function doDeleteRole(
	level: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const res = await fetch(`/api/guild/roles/${encodeURIComponent(level)}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			const data = await res.json();
			return {
				success: false,
				error: data.error || "No se pudo eliminar el rol",
			};
		}
		return { success: true };
	} catch {
		return { success: false, error: "No se pudo eliminar el rol" };
	}
}

export function RolesListClient({ roles }: RolesListClientProps) {
	const { mutate } = useSWRConfig();
	const [crud, setCrud] = useState({
		localRoles: roles as AppRole[],
		processingRole: null as string | null,
		roleToDelete: null as AppRole | null,
		deletingRole: false,
	});
	const { localRoles, processingRole, roleToDelete, deletingRole } = crud;
	const setRoleToDelete = (value: AppRole | null) =>
		setCrud((prev) => ({ ...prev, roleToDelete: value }));
	const setDeletingRole = (value: boolean) =>
		setCrud((prev) => ({ ...prev, deletingRole: value }));
	const setLocalRoles = (updater: (roles: AppRole[]) => AppRole[]) =>
		setCrud((prev) => ({ ...prev, localRoles: updater(prev.localRoles) }));

	const orderedRoles = localRoles.toSorted((a, b) => b.priority - a.priority);

	const handleMove = async (level: string, direction: "up" | "down") => {
		setCrud((prev) => ({ ...prev, processingRole: level }));
		setCrud((prev) => ({
			...prev,
			localRoles: (() => {
				const sorted = prev.localRoles.toSorted(
					(a, b) => b.priority - a.priority,
				);
				const index = sorted.findIndex((role) => role.level === level);
				if (index === -1) return prev.localRoles;
				const targetIndex = direction === "up" ? index - 1 : index + 1;
				if (targetIndex < 0 || targetIndex >= sorted.length)
					return prev.localRoles;

				const clone = [...sorted];
				const temp = clone[index];
				clone[index] = clone[targetIndex];
				clone[targetIndex] = temp;

				return clone;
			})(),
		}));

		const sorted = localRoles.toSorted((a, b) => b.priority - a.priority);
		const sourceIndex = sorted.findIndex((role) => role.level === level);
		const neighborIndex =
			direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
		if (
			sourceIndex === -1 ||
			neighborIndex < 0 ||
			neighborIndex >= sorted.length
		) {
			setCrud((prev) => ({ ...prev, processingRole: null }));
			return;
		}

		const success = await swapPriorities(
			sorted[sourceIndex],
			sorted[neighborIndex],
		);
		if (!success) {
			setCrud((prev) => ({ ...prev, localRoles: roles }));
		}
		void mutate("/api/guild/roles");
		setCrud((prev) => ({ ...prev, processingRole: null }));
	};

	const handleConfirmDelete = async () => {
		if (!roleToDelete) return;
		setDeletingRole(true);
		const result = await doDeleteRole(roleToDelete.level);
		if (result.success) {
			setLocalRoles((current) =>
				current.filter((role) => role.level !== roleToDelete.level),
			);
			void mutate("/api/guild/roles");
			setRoleToDelete(null);
		} else {
			console.error(result.error);
		}
		setDeletingRole(false);
	};

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
						Jerarquía interna
					</p>
					<h1 className="text-3xl font-semibold font-heading italic tracking-tight uppercase text-white">
						Roles y accesos
					</h1>
					<p className="text-sm text-white/60 max-w-2xl">
						Consulta todos los roles configurados en la web de Artic Tempest, su
						orden y si tienen acceso al panel privado. Edita, reordena o crea
						nuevos perfiles para ajustar permisos.
					</p>
				</div>
				<Button asChild className="gap-2">
					<Link href="/zona-raider/configuracion/roles/nuevo">
						<IconPlus className="size-4" /> Nuevo rol
					</Link>
				</Button>
			</div>

			<DesktopRolesTable
				roles={orderedRoles}
				processingRole={processingRole}
				onMove={(level, dir) => void handleMove(level, dir)}
				onDelete={setRoleToDelete}
			/>
			<MobileRolesCards
				roles={orderedRoles}
				processingRole={processingRole}
				onDelete={setRoleToDelete}
			/>
			<DeleteRoleDialog
				roleToDelete={roleToDelete}
				deletingRole={deletingRole}
				onOpenChange={(open) => !open && !deletingRole && setRoleToDelete(null)}
				onConfirmDelete={handleConfirmDelete}
				onCancel={() => setRoleToDelete(null)}
			/>
		</div>
	);
}
