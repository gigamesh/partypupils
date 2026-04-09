import { isInternalUrl } from "@/lib/urls";

interface LinksListProps {
  links: { id: number; title: string; url: string }[];
}

export function LinksList({ links }: LinksListProps) {
  if (links.length === 0) return null;

  return (
    <nav className="hidden lg:flex flex-col gap-2">
      {links.map((link) => {
        const internal = isInternalUrl(link.url);
        return (
          <a
            key={link.id}
            href={link.url}
            {...(!internal && { target: "_blank", rel: "noopener noreferrer" })}
            className="neon-link text-sm font-semibold uppercase tracking-wider whitespace-nowrap"
          >
            {link.title}
          </a>
        );
      })}
    </nav>
  );
}
