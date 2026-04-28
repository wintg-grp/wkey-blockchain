import Image from "next/image";
import Link from "next/link";

const LOGO = process.env.NEXT_PUBLIC_LOGO_URL ?? "";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 group focus-ring rounded-lg"
      aria-label="WINTG Scan home"
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
        // Placeholder mark until the brand logo is uploaded
        <span
          className="grid place-items-center font-bold text-white bg-wintg-gradient rounded-md shadow-glow"
          style={{ width: size, height: size, fontSize: size * 0.45 }}
        >
          W
        </span>
      )}
      <span className="hidden sm:flex flex-col leading-tight">
        <span className="font-bold text-white tracking-tight">WINTG Scan</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-300">
          Block explorer
        </span>
      </span>
    </Link>
  );
}
