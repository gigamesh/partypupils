import Image from "@/components/Image";
import { SocialLinks } from "@/components/SocialLinks";
import { detectLinkPlatform, PlatformIcon } from "@/lib/link-platforms";
import { isInternalUrl } from "@/lib/urls";

interface LinkItem {
  id: number | string;
  title: string;
  url: string;
}

interface Props {
  cover?: { src: string; alt: string } | null;
  /** Title block rendered between the cover and the social row (e.g. logo + tagline, or h1 + description). */
  header: React.ReactNode;
  items: LinkItem[];
}

/**
 * Shared visual shell for the public /links and /links/[slug] pages.
 * Platform icons auto-detect from each URL; unknown URLs render as plain text buttons.
 */
export function LinkPageLayout({ cover, header, items }: Props) {
  return (
    <div className="min-h-dvh flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center gap-5">
        {cover && (
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden ring-2 ring-white/20">
            <Image
              src={cover.src}
              alt={cover.alt}
              width={400}
              height={400}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        )}

        <div className="text-center">{header}</div>

        <SocialLinks iconSize={22} />

        <div className="w-full flex flex-col gap-3 mt-2">
          {items.map((item) => {
            const platform = detectLinkPlatform(item.url);
            const internal = isInternalUrl(item.url);
            return (
              <a
                key={item.id}
                href={item.url}
                {...(!internal && {
                  target: "_blank",
                  rel: "noopener noreferrer",
                })}
                className="flex items-center justify-center gap-3 w-full py-3.5 px-4 rounded-full
                  border border-neon/30 bg-neon-dark/20 backdrop-blur-sm
                  text-white font-medium text-sm uppercase tracking-wide
                  hover:bg-neon/20 hover:border-neon/60
                  transition-all duration-200"
              >
                {platform && <PlatformIcon platform={platform} size={18} />}
                <span>{item.title}</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
