import { cn } from "@/lib/utils";
import { SOCIAL_LINKS } from "@/lib/constants";
import { PlatformIcon, type LinkPlatform } from "@/lib/link-platforms";

interface SocialLinksProps {
  className?: string;
  iconSize?: number;
}

export function SocialLinks({ className = "", iconSize = 28 }: SocialLinksProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.name}
          className="neon-link"
        >
          <PlatformIcon platform={link.icon as LinkPlatform} size={iconSize} />
        </a>
      ))}
    </div>
  );
}
