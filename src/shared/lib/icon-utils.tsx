"use client";

import React, {
	type ComponentProps,
	type ComponentType,
} from "react";
import { IconCircle } from "@/shared/ui/tabler-icons";
import { ALL_ICONS_MAP } from "./icons-list";

// Props accepted by any icon in the curated barrel (Tabler-compatible).
type IconComponentProps = ComponentProps<typeof IconCircle>;

export const ICON_MAP: Record<string, ComponentType<IconComponentProps>> = {
	...ALL_ICONS_MAP,
	IconCircle,
};

const normalizeToken = (value: string) =>
	String(value || "")
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase();

const toPascalCase = (value: string) =>
	String(value || "")
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.reduce(
			(acc, part) => acc + part.charAt(0).toUpperCase() + part.slice(1),
			"",
		);

const LUCIDE_TO_TABLER_ALIASES: Record<string, string> = {
	globe: "World",
	layouthome: "Home",
	appwindow: "Apps",
	squares2x2: "LayoutGrid",
	settings2: "Settings",
	home: "Home",
	house: "Home",
};

const TABLER_ICON_KEYS = Object.keys(ICON_MAP);
const TABLER_ICON_INDEX = new Map(
	TABLER_ICON_KEYS.map((key) => [normalizeToken(key), key]),
);

const resolveFromCandidates = (candidates: string[]) => {
	for (const candidate of candidates) {
		if (!candidate) continue;
		const direct = ICON_MAP[candidate];
		if (direct) return direct;

		const prefixed = ICON_MAP[`Icon${candidate}`];
		if (prefixed) return prefixed;

		const indexedKey = TABLER_ICON_INDEX.get(normalizeToken(candidate));
		if (indexedKey && ICON_MAP[indexedKey]) {
			return ICON_MAP[indexedKey];
		}
	}

	return null;
};

// Cache for icons loaded from the full Tabler barrel
const tablerIconCache = new Map<string, ComponentType<IconComponentProps>>();
const fallbackCache = new Map<
	string,
	ComponentType<IconComponentProps>
>();
let tablerModulePromise: Promise<any> | null = null;

function getTablerModule() {
	if (!tablerModulePromise) {
		tablerModulePromise = import("@tabler/icons-react");
	}
	return tablerModulePromise;
}

function LazyTablerIcon({
	name,
	...props
}: { name: string } & IconComponentProps) {
	const [Comp, setComp] = React.useState<ComponentType<IconComponentProps> | null>(
		() => tablerIconCache.get(name) ?? null,
	);

	// If the icon name changes, pick it up from the cache during render
	// (React-endorsed state adjustment when a prop changes).
	const [prevName, setPrevName] = React.useState(name);
	if (prevName !== name) {
		setPrevName(name);
		setComp(() => tablerIconCache.get(name) ?? null);
	}

	React.useEffect(() => {
		if (tablerIconCache.has(name)) return;

		let cancelled = false;
		getTablerModule()
			.then((mod) => {
				if (cancelled) return;
				const icon = (mod as any)[name];
				if (icon) {
					tablerIconCache.set(name, icon);
					setComp(() => icon);
				}
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [name]);

	if (Comp) return <Comp {...props} />;
	return <IconCircle {...props} />;
}

export function getIconByName(name: string | null | undefined) {
	if (!name) return IconCircle;

	const raw = String(name).trim();
	const withoutIconPrefix = raw.replace(/^Icon/i, "");
	const withoutVendorPrefix = withoutIconPrefix
		.replace(/^Lucide/i, "")
		.replace(/^Tabler/i, "");
	const pascal = toPascalCase(withoutVendorPrefix);

	const alias = LUCIDE_TO_TABLER_ALIASES[normalizeToken(pascal)] || "";

	const resolved = resolveFromCandidates([
		raw,
		withoutIconPrefix,
		withoutVendorPrefix,
		pascal,
		alias,
	]);

	if (resolved) return resolved;

	// Not in the barrel — lazy-load from the full Tabler module
	// Cache the wrapper so React sees a stable component reference
	const fallbackCacheKey = `__lazy_${raw}`;
	if (!fallbackCache.has(fallbackCacheKey)) {
		fallbackCache.set(
			fallbackCacheKey,
			function TablerIconWrapper(props: IconComponentProps) {
				return <LazyTablerIcon name={raw} {...props} />;
			},
		);
	}
	return fallbackCache.get(fallbackCacheKey)!;
}
