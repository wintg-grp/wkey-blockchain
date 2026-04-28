"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL ?? "/brand/logo.png";

/**
 * Logo
 * ----
 * Renders the WINTG mark. Tries to load /brand/logo.png (or whatever
 * NEXT_PUBLIC_LOGO_URL points to). If the file is missing — typical
 * during early development — falls back to a generated `W` tile so the
 * header never looks broken.
 */
export function Logo({ size = 36 }: { size?: number }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 group focus-ring rounded-lg"
      aria-label="WINTG Scan"
    >
      {failed ? (
        <span
          className="grid place-items-center font-display text-accent-fg bg-wintg-gradient rounded-md shadow-flat"
          style={{ width: size, height: size, fontSize: size * 0.55 }}
        >
          W
        </span>
      ) : (
        <Image
          src={LOGO_URL}
          alt="WINTG"
          width={size}
          height={size}
          priority
          unoptimized
          className="rounded-md object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </Link>
  );
}
