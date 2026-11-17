import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition duration-150 focus-visible:outline-none disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: "btn-primary",
        outline: "border border-border bg-card text-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:text-muted",
        ghost: "text-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:text-muted",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
