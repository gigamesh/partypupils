import { prisma } from "@/lib/db";
import { ReleaseCard } from "@/components/ReleaseCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Music | Party Pupils",
  description: "Browse and buy music from Party Pupils.",
};

export default async function MusicPage() {
  const releases = await prisma.release.findMany({
    where: { isPublished: true },
    orderBy: { releasedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="neon-glow text-3xl mb-8 uppercase">Music</h1>
      {releases.length === 0 ? (
        <p className="text-muted-foreground">No music available yet. Check back soon!</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {releases.map((release) => (
            <ReleaseCard
              key={release.id}
              name={release.name}
              slug={release.slug}
              price={release.price}
              type={release.type}
              coverImageUrl={release.coverImageUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
