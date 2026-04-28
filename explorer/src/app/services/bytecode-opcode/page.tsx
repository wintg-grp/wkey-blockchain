"use client";

import { FeaturePreview } from "@/components/FeaturePreview";
import { networkFromParam } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { net?: string } }) {
  return (
    <FeaturePreview
      network={networkFromParam(searchParams.net)}
      fr={{"title":"Bytecode → Opcode","description":"Convertissez le bytecode d'un contrat en opcodes lisibles. Pratique pour comprendre ce qu'un contrat non vérifié fait réellement."}}
      en={{"title":"Bytecode → Opcode","description":"Convert a contract's bytecode into human-readable opcodes. Handy to understand what an unverified contract really does."}}
    />
  );
}
