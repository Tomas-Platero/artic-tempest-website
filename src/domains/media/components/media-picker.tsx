"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import {
	IconPhoto,
	IconDownload,
	IconFolder,
	IconArrowLeft,
} from "@/shared/ui/tabler-icons";
import { Button } from "@/shared/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { UploadZone } from "./upload-zone";
import { EmptyState } from "./empty-state";
import { useMediaFiles } from "@/domains/media/hooks/use-media-files";
import type {
	MediaFile,
	MediaPickerProps,
	MediaFolder,
} from "@/domains/media/types";

function isImageByExt(storagePath: string): boolean {
	const ext = storagePath.split(".").pop()?.toLowerCase();
	return ext ? /^(jpg|jpeg|png|gif|webp|avif|svg|bmp|ico)$/.test(ext) : false;
}

function FileTypeIcon({
	mimeType,
	storagePath,
}: {
	mimeType: string;
	storagePath: string;
}) {
	if (!mimeType && !isImageByExt(storagePath)) {
		return <IconFolder className="size-12 text-amber-400/60" />;
	}
	if (mimeType.startsWith("image/") || isImageByExt(storagePath)) {
		return <IconPhoto className="size-12 text-white/40" />;
	}
	return <IconDownload className="size-12 text-white/30" />;
}

/**
 * Loads the root folder list of the media picker.
 *
 * Staleness/loading is *derived* during render (`key !== uploadKey`) instead of
 * tracked with a `loading` flag, so the effect only ever writes fetched data:
 * no synchronous setState and no try/catch/finally for React Compiler to lower.
 */
function useMediaFolders(
	open: boolean,
	currentBucket: string | null,
	uploadKey: number,
) {
	// `key` is the uploadKey the list was loaded for, so a stale list (or an
	// unloaded one) can be detected during render instead of with a setState.
	const [folders, setFolders] = useState<{
		key: number;
		items: MediaFolder[];
	} | null>(null);

	useEffect(() => {
		if (!open || currentBucket !== null) return;

		let cancelled = false;

		fetch("/api/media/folders")
			.then((r) => (r.ok ? r.json() : { folders: [] }))
			.then((data) => {
				if (!cancelled) {
					setFolders({ key: uploadKey, items: data.folders ?? [] });
				}
			})
			.catch(() => {
				// ignore fetch errors — the grid simply stays empty
				if (!cancelled) setFolders({ key: uploadKey, items: [] });
			});

		return () => {
			cancelled = true;
		};
	}, [open, currentBucket, uploadKey]);

	return {
		foldersLoading: folders?.key !== uploadKey,
		folderItems: folders?.items ?? [],
	};
}

export function MediaPicker({
	bucket: _bucket,
	onSelect,
	onClose,
	open,
	title = "Biblioteca Multimedia",
	showUpload = false,
}: MediaPickerProps) {
	// Navigation state: null = show folders, string = inside a bucket
	const [currentBucket, setCurrentBucket] = useState<string | null>(null);
	const [uploadKey, setUploadKey] = useState(0);

	const { foldersLoading, folderItems } = useMediaFolders(
		open,
		currentBucket,
		uploadKey,
	);

	// Files for current bucket
	const { files, isLoading } = useMediaFiles({
		bucket: currentBucket ?? "",
	});

	const handleSelect = useCallback(
		(file: MediaFile) => {
			onSelect(file);
		},
		[onSelect],
	);

	const handleEnterFolder = useCallback((folder: MediaFolder) => {
		setCurrentBucket(folder.bucket_name);
	}, []);

	const handleBack = useCallback(() => {
		setCurrentBucket(null);
	}, []);

	const handleUploadComplete = useCallback(() => {
		setUploadKey((k) => k + 1);
	}, []);

	if (!open) return null;

	const isFolderView = currentBucket === null;

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) onClose();
			}}
		>
			<DialogContent className="w-[calc(100vw-16px)] sm:!max-w-[95vw] sm:!w-[95vw] max-h-[96vh] flex flex-col bg-[#0c0c0e] border-white/10 mx-2 sm:mx-0">
				<DialogHeader className="shrink-0 flex-row items-center gap-3">
					{!isFolderView && (
						<Button
							variant="outline"
							size="icon"
							className="size-9 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 shrink-0"
							onClick={handleBack}
							aria-label="Volver a carpetas"
						>
							<IconArrowLeft className="size-4" />
						</Button>
					)}
					<DialogTitle className="text-lg font-semibold text-white/80">
						{title}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Selecciona archivos multimedia de la biblioteca
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
					{/* Upload zone — only inside a bucket */}
					{!isFolderView && showUpload && (
						<div className="shrink-0">
							<UploadZone
								key={`upload-${uploadKey}`}
								bucket={currentBucket!}
								onUploadComplete={handleUploadComplete}
								canEdit={true}
							/>
						</div>
					)}

					{/* Content area */}
					<div className="flex-1 overflow-y-auto min-h-0">
						{isFolderView ? (
							/* ── Folder grid ── */
							foldersLoading ? (
								<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
									{Array.from({ length: 12 }).map((_, i) => (
										<div
											key={`skel-${i}`}
											className="aspect-video rounded-xl bg-white/5 animate-pulse"
										/>
									))}
								</div>
							) : folderItems.length === 0 ? (
								<EmptyState message="No hay carpetas disponibles." />
							) : (
								<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
									{folderItems.map((folder) => (
										<button
											key={folder.id}
											type="button"
											onClick={() => handleEnterFolder(folder)}
											className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:border-amber-400/40 hover:bg-amber-400/5 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/50"
										>
											<IconFolder className="size-12 text-amber-400/50 group-hover:text-amber-400/80 transition-colors" />
											<div className="text-center min-w-0 w-full">
												<p className="text-sm font-medium text-white/70 group-hover:text-white/90 break-all leading-tight">
													{folder.display_name}
												</p>
												<p className="text-[10px] text-white/30 mt-1">
													{folder.file_count} archivos
												</p>
											</div>
										</button>
									))}
								</div>
							)
						) : /* ── File grid inside a bucket ── */
						isLoading ? (
							<div
								data-testid="picker-loading"
								className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
							>
								{Array.from({ length: 16 }).map((_, i) => (
									<div
										key={`skel-${i}`}
										className="aspect-square rounded-xl bg-white/5 animate-pulse"
									/>
								))}
							</div>
						) : files.length === 0 ? (
							<EmptyState
								message="Esta carpeta está vacía."
								hint="Sube archivos usando el botón de arriba."
							/>
						) : (
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
								{files.map((file) => {
									const isImage =
										file.mime_type.startsWith("image/") ||
										isImageByExt(file.storage_path);
									const isFolder =
										!file.mime_type && !isImageByExt(file.storage_path);

									return (
										<button
											key={file.id}
											tabIndex={isFolder ? -1 : 0}
											data-testid={`picker-file-card-${file.id}`}
											onClick={() => {
												if (!isFolder) handleSelect(file);
											}}
											onKeyDown={(e) => {
												if ((e.key === "Enter" || e.key === " ") && !isFolder) {
													e.preventDefault();
													handleSelect(file);
												}
											}}
											className={`group relative flex flex-col rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
												isFolder
													? "border-amber-500/20 bg-amber-500/5 cursor-default"
													: "border-white/10 bg-white/5 hover:border-primary/40 hover:bg-white/10 cursor-pointer"
											}`}
										>
											<div className="relative aspect-square w-full bg-white/5 flex items-center justify-center rounded-t-xl overflow-hidden">
												{isImage ? (
													<Image
														src={file.url}
														alt={
															file.alt_text || file.title || file.storage_path
														}
														fill
														sizes="(max-width: 768px) 50vw, 25vw"
														className="object-cover"
													/>
												) : (
													<FileTypeIcon
														mimeType={file.mime_type}
														storagePath={file.storage_path}
													/>
												)}
											</div>
											<div className="p-3 min-w-0 flex flex-col gap-2">
												<p className="text-xs font-medium text-white/70 break-all leading-tight">
													{file.title || file.storage_path}
												</p>
												{isFolder ? (
													<span className="text-[10px] text-amber-400/50 font-medium uppercase tracking-wide">
														Subcarpeta
													</span>
												) : (
													<Button
														type="button"
														variant="ghost"
														size="sm"
														className="w-full rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] h-7"
														onClick={(e) => {
															e.stopPropagation();
															handleSelect(file);
														}}
													>
														Usar este archivo
													</Button>
												)}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end pt-3 border-t border-white/5 shrink-0">
					<Button
						variant="outline"
						size="sm"
						className="rounded-xl border-white/10 bg-white/5"
						onClick={onClose}
					>
						Cancelar
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
