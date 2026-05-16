import { getFaqContent } from "@/lib/faq";
import { FAQ_DEFAULTS } from "@/lib/faq-defaults";
import { FaqEditor } from "./FaqEditor";

export const dynamic = "force-dynamic";

export default async function AdminFaqPage() {
  const content = await getFaqContent();

  return (
    <div>
      <h1>FAQ</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Edit the FAQ shown on <code>/faq</code> and on post-purchase pages.
        Answers use a rich-text editor — bold, italic, links, and paragraph
        breaks are supported.
      </p>
      <FaqEditor initialItems={content.items} defaultItems={FAQ_DEFAULTS.items} />
    </div>
  );
}
