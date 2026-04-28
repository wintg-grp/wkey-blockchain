import { Logo } from "./Logo";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { SearchBar } from "./SearchBar";
import type { NetworkKey } from "@/lib/networks";

export function Header({ network }: { network: NetworkKey }) {
  const docUrl = process.env.NEXT_PUBLIC_DOC_URL ?? "https://doc.wintg.network";
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-ink-950/70 border-b border-ink-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        <Logo />

        <div className="hidden md:block flex-1 max-w-xl mx-auto">
          <SearchBar />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex text-sm text-ink-200 hover:text-white transition-colors"
          >
            Docs
          </a>
          <NetworkSwitcher current={network} />
        </div>
      </div>
      {/* Mobile search bar */}
      <div className="md:hidden px-4 pb-3">
        <SearchBar />
      </div>
    </header>
  );
}
