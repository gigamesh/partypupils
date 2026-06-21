import type { Metadata } from "next";
import { FaqList } from "@/components/DownloadFAQ";
import { getFaqContent } from "@/lib/faq";

// ISR: serve cached HTML from the CDN and revalidate hourly instead of
// re-querying Postgres on every visit (which kept Neon's compute awake).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions about Party Pupils downloads.",
};

export default async function FaqPage() {
  const { items, video } = await getFaqContent();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="neon-glow uppercase mb-6">FAQ</h1>
      <FaqList items={items} video={video} title="Frequently Asked Questions" />
    </div>
  );
}
