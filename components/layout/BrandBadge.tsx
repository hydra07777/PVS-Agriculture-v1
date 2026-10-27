import Image from "next/image";

import { brand } from "@/lib/content";
import { brandLogo } from "@/lib/og";

type BrandBadgeProps = {
  /** Côté du logo en pixels (défaut : 46px, taille de la navbar). */
  size?: number;
  className?: string;
  /** `true` pour un rendu prioritaire (LCP) — à réserver au logo du hero. */
  priority?: boolean;
};

/**
 * Logo officiel PVS (image `public/pvs-pwa/logo-transparent.png`, générée
 * depuis `public/images/og-cover.jpg` par `npm run logos:regen`).
 *
 * Le fichier a un alpha circulaire : il se pose aussi bien sur le fond clair
 * de la navbar que sur le fond sombre du footer ou de la page de connexion.
 *
 * Le nom de la marque reste en texte à côté dans les appelants (accessibilité
 * et référencement), l'image est donc purement décorative.
 */
export default function BrandBadge({
  size = 46,
  className = "",
  priority = false,
}: BrandBadgeProps) {
  return (
    <Image
      src={brandLogo.url}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      priority={priority}
      sizes={`${size}px`}
      className={`shrink-0 select-none rounded-full object-contain shadow-brand ${className}`}
    />
  );
}

/** Nom de la marque, réutilisé dans les infobulles et libellés accessibles. */
export const brandLabel = `${brand.name} ${brand.tagline}`;
