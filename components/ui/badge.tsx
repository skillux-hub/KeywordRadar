import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md border border-border bg-accent px-1.5 py-0.5 text-[11px] text-muted", className)}
      {...props}
    />
  );
}
