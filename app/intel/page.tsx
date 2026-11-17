import { Suspense } from "react";
import { SourceBoard } from "@/components/source-board";

export const dynamic = "force-dynamic";

export default function IntelPage() {
  return (
    <Suspense>
      <SourceBoard platform="all" />
    </Suspense>
  );
}
