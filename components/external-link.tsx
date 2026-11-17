import { ExternalLink as ExternalLinkIcon } from "lucide-react";

export function ExternalLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  if (!href) return <span className={`break-words ${className}`}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex max-w-full items-start gap-1 break-words text-primary hover:underline ${className}`}>
      <span className="min-w-0 break-words">{children}</span>
      <ExternalLinkIcon size={13} className="mt-0.5 shrink-0" aria-hidden />
    </a>
  );
}
