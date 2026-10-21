"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { IconBell } from "@/shared/ui/tabler-icons";
import Link from "next/link";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/shared/ui/tooltip";

export function NotificationBell() {
	const { status } = useSession();
	const [unreadCount, setUnreadCount] = useState(0);

	const fetchUnreadCount = useCallback(async () => {
		if (status !== "authenticated") return;
		try {
			const res = await fetch("/api/notifications");
			if (res.ok) {
				const data = await res.json();
				if (Array.isArray(data)) {
					const count = data.filter((n: any) => !n.isRead).length;
					setUnreadCount(count);
				}
			}
		} catch (error) {
			console.error("Error fetching notification count:", error);
		}
	}, [status]);

	useEffect(() => {
		if (status !== "authenticated") return;

		// Initial read after mount: `unreadCount` is server data that can only be
		// known once /api/notifications answers — nothing to derive during render.
		// react-doctor-disable-next-line react-hooks-js/set-state-in-effect
		void fetchUnreadCount();

		const handleNotificationUpdate = () => {
			void fetchUnreadCount();
		};

		window.addEventListener("notifications-updated", handleNotificationUpdate);
		const intervalId = window.setInterval(handleNotificationUpdate, 120_000);

		return () => {
			window.removeEventListener(
				"notifications-updated",
				handleNotificationUpdate,
			);
			window.clearInterval(intervalId);
		};
	}, [status, fetchUnreadCount]);

	if (status !== "authenticated") return null;

	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						href="/notificaciones"
						aria-label="Notificaciones"
						className="relative p-2 rounded-full hover:bg-white/5 text-white/70 hover:text-white  group"
					>
						<IconBell className="size-5 group-hover:scale-110 transition-transform" />
						{unreadCount > 0 && (
							<span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white ring-2 ring-black animate-in zoom-in duration-300">
								{unreadCount > 9 ? "+9" : unreadCount}
							</span>
						)}
					</Link>
				</TooltipTrigger>
				<TooltipContent sideOffset={4}>
					Ver notificaciones del sistema
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
