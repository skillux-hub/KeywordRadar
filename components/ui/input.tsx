import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-primary",
        className,
      )}
      {...props}
    />
  );
}
