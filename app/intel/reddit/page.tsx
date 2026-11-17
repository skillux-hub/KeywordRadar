import { Suspense } from "react";
import { SourceBoard } from "@/components/source-board";

export const dynamic = "force-dynamic";

export default function RedditSourcesPage() {
  return (
    <Suspense>
      <SourceBoard platform="reddit" />
    </Suspense>
  );
}
