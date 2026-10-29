import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth";

// Note : `export const runtime` est interdit dans un fichier `proxy.ts`.
// Le proxy s'exécute toujours sur le runtime Node.js par défaut sous
// Next.js 16, donc cette déclaration déclenche une erreur de build.

/**
 * CSP du site.
 *
 * ⚠️ Pourquoi PAS de nonce (`'nonce-…'`) ni de `'strict-dynamic'` ?
 *
 * Next.js n'applique le nonce de la CSP qu'aux pages rendues À LA
 * REQUÊTE (SSR/ISR). Les pages prérendues (`/`, `/agriculture`,
 * `/tarifs`, `/contact`…) sont sérialisées dans `.next/server/app/**.html`
 * AU MOMENT DU BUILD : aucun en-tête de requête n'existe à ce moment-là,
 * donc aucun nonce n'est disponible et les `<script>` sont sérialisés
 * SANS attribut `nonce`.
 *
 * Or, dès qu'un nonce est présent dans `script-src` :
 *   1. le navigateur IGNORE `'unsafe-inline'` (CSP Level 3) ;
 *   2. avec `'strict-dynamic'`, il ignore aussi `'self'` (l'allowlist
 *      par hôte est désactivée).
 * Il ne reste alors plus AUCUNE source valide : ni les chunks servies
 * depuis notre propre domaine, ni le payload RSC inline de Next.js.
 *
 * Conséquence observée en production : la page s'affiche mais reste
 * bloquée sur `app/loading.tsx` (PageLoader), car l'hydratation React
 * ne démarre jamais (tous les scripts bloqués par la CSP).
 *
 * On applique donc une CSP SANS nonce, compatible pages statiques ET
 * dynamiques. Les protections fortes restent actives : `object-src
 * 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors
 * 'none'`, `default-src 'self'`.
 */
function buildCsp(): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // 'unsafe-eval' requis en dev (Webpack HMR / source maps).
    // ⚠️ Ne JAMAIS ajouter un nonce ici : il neutraliserait
    // 'unsafe-inline' et re-bloquerait les scripts des pages statiques.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind produit du CSS compilé, mais framer-motion et les libs de
    // charts injectent des styles inline.
    "style-src 'self' 'unsafe-inline'",
    // Images : locales + data: (QR code 2FA, placeholders) + CDN externes.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const csp = buildCsp();

  const next = () => {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  const isLoginPage =
    pathname === "/admin/login" || pathname === "/admin/forgot-password";
  // /api/admin/login/* (dont /2fa) et /api/admin/forgot-password/* sont
  // publics : ils émettent la session après vérification du code.
  const isLoginApi =
    pathname === "/api/admin/login" || pathname.startsWith("/api/admin/login/");
  const isForgotApi = pathname.startsWith("/api/admin/forgot-password");
  const isProtectedPage = pathname.startsWith("/admin") && !isLoginPage;
  const isProtectedApi =
    pathname.startsWith("/api/admin") && !isLoginApi && !isForgotApi;

  if (!isProtectedPage && !isProtectedApi) {
    return next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = await verifyAdminSessionToken(token);

  if (!session) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const isUsersPage = pathname.startsWith("/admin/users");
  const isUsersApi = pathname.startsWith("/api/admin/users");

  if ((isUsersPage || isUsersApi) && session.role !== "SUPER_ADMIN") {
    if (isUsersApi) {
      return NextResponse.json(
        { error: "Accès réservé aux super administrateurs." },
        { status: 403 },
      );
    }
    const adminHomeUrl = new URL("/admin", request.url);
    return NextResponse.redirect(adminHomeUrl);
  }

  return next();
}

export const config = {
  matcher: [
    {
      // Toutes les pages sauf assets statiques — la CSP doit couvrir tout
      // le site, pas seulement l'admin.
      source:
        "/((?!_next/static|_next/image|favicon.ico|uploads|files|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
