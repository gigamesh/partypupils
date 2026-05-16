import { z } from "zod";

export const FaqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1).max(300),
  // Answer is Tiptap-generated HTML (paragraphs, bold, italic, links). The cap
  // is generous to allow long answers; raise it before rejecting real content.
  answer: z.string().trim().min(1).max(10000),
});

export const FaqContentSchema = z.object({
  items: z.array(FaqItemSchema).max(50),
});

export type FaqItem = z.infer<typeof FaqItemSchema>;
export type FaqContent = z.infer<typeof FaqContentSchema>;
