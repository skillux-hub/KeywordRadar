import { Suspense } from "react";
import { SourceBoard } from "@/components/source-board";

export const dynamic = "force-dynamic";

export default function XSourcesPage() {
  return (
    <Suspense>
      <SourceBoard platform="x" />
    </Suspense>
  );
}
