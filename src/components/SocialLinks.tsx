import { cn } from "@/lib/utils";
import { SOCIAL_LINKS } from "@/lib/constants";

const iconPaths: Record<string, React.ReactNode> = {
  twitter: (
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  ),
  facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  instagram: (
    <>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </>
  ),
  spotify: (
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.84.2c-2.3-1.4-5.2-1.7-8.6-.9a.6.6 0 1 1-.28-1.18c3.7-.88 6.9-.5 9.5 1.04a.6.6 0 0 1 .22.84zm1.2-2.72a.78.78 0 0 1-1.06.26c-2.6-1.6-6.6-2.06-9.7-1.12a.78.78 0 1 1-.44-1.5c3.5-1.06 7.9-.54 10.94 1.3a.78.78 0 0 1 .26 1.06zm.1-2.84C14.6 8.8 9.5 8.6 6.4 9.56a.94.94 0 1 1-.54-1.8c3.5-1.06 9.4-.86 13.1 1.34a.94.94 0 0 1-.54 1.74z" />
  ),
  soundcloud: (
    <path d="M2 14.5v-2m3 3.5V11m3 6V9m3 8V7m3 10V5m3 12V3m3 14v-8m3 8v-4" />
  ),
  apple: (
    <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 5-4.5 5-6.5 0-.68-1.65-1-2.5-1.44C17.16 13.32 16 11.87 16 10c0-2.58 1.87-3.87 2-4-1.13-1.62-3-2-3.5-2C13 4 12 5 11 5S9 4 7.5 4c-.5 0-2.37.38-3.5 2 .13.13 2 1.42 2 4 0 1.87-1.16 3.32-2.5 4.06C2.65 14.5 1 14.82 1 15.5c0 2 2 6.5 5 6.5 1.25 0 2.5-1.06 4-1.06zM12 3a4 4 0 0 0 1-3 4 4 0 0 0-1 3z" />
  ),
  youtube: (
    <>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </>
  ),
};

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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {iconPaths[link.icon]}
          </svg>
        </a>
      ))}
    </div>
  );
}
