"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/shared/tailwind/tailwind-utils";

interface TurnstileWidgetProps {
	onVerify: (token: string) => void;
	onError?: () => void;
	onExpire?: () => void;
	className?: string;
}

export interface TurnstileWidgetRef {
	reset: () => void;
	remove: () => void;
}

declare global {
	interface Window {
		turnstile?: {
			render: (
				container: string | HTMLElement,
				options: TurnstileRenderOptions,
			) => string;
			reset: (widgetId?: string) => void;
			remove: (widgetId?: string) => void;
		};
		onTurnstileLoad?: () => void;
	}
}

interface TurnstileRenderOptions {
	sitekey: string;
	callback?: (token: string) => void;
	"error-callback"?: () => void;
	"expired-callback"?: () => void;
	theme?: "light" | "dark" | "auto";
	size?: "normal" | "compact";
	language?: string;
	appearance?: "always" | "execute" | "interaction-only";
}

const TURNSTILE_SCRIPT_URL =
	"https://challenges.cloudflare.com/turnstile/v0/api.js";
const WIDGET_CONTAINER_ID = "turnstile-widget";
const SITE_KEY =
	process.env.NODE_ENV === "production"
		? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
		: undefined;

export const TurnstileWidget = forwardRef<
	TurnstileWidgetRef,
	TurnstileWidgetProps
>(function TurnstileWidget({ onVerify, onError, onExpire, className }, ref) {
	const widgetIdRef = useRef<string | null>(null);
	const callbacksRef = useRef({ onVerify, onError, onExpire });
	const scriptLoadedRef = useRef(false);

	useEffect(() => {
		callbacksRef.current = { onVerify, onError, onExpire };
	});

	useImperativeHandle(ref, () => ({
		reset: () => {
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.reset(widgetIdRef.current);
			}
		},
		remove: () => {
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		},
	}));

	function renderWidget() {
		const container = document.getElementById(WIDGET_CONTAINER_ID);
		if (!container || !window.turnstile || !SITE_KEY) return;

		if (widgetIdRef.current) {
			window.turnstile.remove(widgetIdRef.current);
		}

		widgetIdRef.current = window.turnstile.render(`#${WIDGET_CONTAINER_ID}`, {
			sitekey: SITE_KEY,
			theme: "dark",
			appearance: "always",
			callback: (token: string) => {
				callbacksRef.current.onVerify(token);
			},
			"error-callback": () => {
				callbacksRef.current.onError?.();
			},
			"expired-callback": () => {
				callbacksRef.current.onExpire?.();
			},
		});
	}

	useEffect(() => {
		if (!SITE_KEY) return;

		if (scriptLoadedRef.current) {
			renderWidget();
			return;
		}

		if (window.turnstile) {
			scriptLoadedRef.current = true;
			renderWidget();
			return;
		}

		const existingScript = document.querySelector(
			`script[src="${TURNSTILE_SCRIPT_URL}"]`,
		);

		if (existingScript) {
			const onLoad = () => {
				scriptLoadedRef.current = true;
				renderWidget();
			};
			existingScript.addEventListener("load", onLoad);

			return () => {
				existingScript.removeEventListener("load", onLoad);
				if (widgetIdRef.current && window.turnstile) {
					window.turnstile.remove(widgetIdRef.current);
					widgetIdRef.current = null;
				}
			};
		}

		const script = document.createElement("script");
		script.src = TURNSTILE_SCRIPT_URL;
		script.async = true;
		script.defer = true;
		script.onload = () => {
			scriptLoadedRef.current = true;
			renderWidget();
		};
		document.head.appendChild(script);

		return () => {
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		};
	}, []);

	if (!SITE_KEY) return null;

	return (
		<div
			id={WIDGET_CONTAINER_ID}
			className={cn("flex justify-center", className)}
		/>
	);
});
