interface LinksListProps {
  links: { id: number; title: string; url: string }[];
}

export function LinksList({ links }: LinksListProps) {
  if (links.length === 0) return null;

  return (
    <nav className="hidden lg:flex flex-col gap-2">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="neon-link text-sm font-semibold uppercase tracking-wider whitespace-nowrap"
        >
          {link.title}
        </a>
      ))}
    </nav>
  );
}
