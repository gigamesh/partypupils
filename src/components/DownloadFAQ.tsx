import { Fragment } from "react";
import { getFaqContent } from "@/lib/faq";
import type { FaqContent } from "@/lib/faq-schema";

/** Tailwind class list applied to the wrapper of FAQ answer HTML, scoped via descendant selectors. */
const ANSWER_CLASSES =
  "text-sm text-muted-foreground [&_p:not(:last-child)]:mb-2 [&_a]:underline [&_strong]:font-semibold [&_em]:italic";

/** Renders a list of FAQ items inside the standard glass panel — shared between the public /faq page and post-purchase pages. */
export function FaqList({
  items,
  title = "Download FAQ",
}: {
  items: FaqContent["items"];
  title?: string;
}) {
  return (
    <div className="glass-panel rounded-lg border p-6 space-y-5">
      <h2>{title}</h2>
      {items.map((item) => (
        <Fragment key={item.id}>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold">{item.question}</h3>
            <div
              className={ANSWER_CLASSES}
              dangerouslySetInnerHTML={{ __html: item.answer }}
            />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Server component: loads admin-editable FAQ content and renders it on post-purchase pages. */
export async function DownloadFAQ() {
  const { items } = await getFaqContent();
  return <FaqList items={items} />;
}
