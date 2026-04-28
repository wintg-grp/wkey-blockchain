import Image from "next/image";
import Link from "next/link";

const LOGO = process.env.NEXT_PUBLIC_LOGO_URL ?? "";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 group focus-ring rounded-lg"
      aria-label="WINTG Scan"
    >
      {LOGO ? (
        <Image
          src={LOGO}
          alt="WINTG"
          width={size}
          height={size}
          priority
          className="rounded-md"
        />
      ) : (
        <span
          className="grid place-items-center font-display text-accent-fg bg-wintg-gradient rounded-md shadow-flat"
          style={{ width: size, height: size, fontSize: size * 0.55 }}
        >
          W
        </span>
      )}
      <span className="hidden sm:flex flex-col leading-tight">
        <span className="font-display text-text uppercase tracking-tight-display text-lg">WINTG</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted -mt-0.5">
          Scan
        </span>
      </span>
    </Link>
  );
}
