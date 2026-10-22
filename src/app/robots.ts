import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // ── Zona Raider (miembros) ──────────────────────────────
          "/zona-raider/",

          // ── Auth y cuenta ───────────────────────────────────────
          "/login/",
          "/mis-personajes/",
          "/notificaciones/",

          // ── Admin y sistema ─────────────────────────────────────
          "/admin/",
          "/api/",
          "/cdn-cgi/",

          // ── Redirecciones internas ──────────────────────────────
          "/cultura",
          "/feedback",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
