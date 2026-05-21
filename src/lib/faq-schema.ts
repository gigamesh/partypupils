import { z } from "zod";
import { parseYouTubeVideo } from "./youtube";

export const FaqItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().trim().min(1).max(300),
  // Answer is Tiptap-generated HTML (paragraphs, bold, italic, links). The cap
  // is generous to allow long answers; raise it before rejecting real content.
  answer: z.string().trim().min(1).max(10000),
});

export const FaqVideoSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .refine((u) => parseYouTubeVideo(u) !== null, "Enter a valid YouTube video or Shorts URL"),
  // Optional intro text rendered above the video.
  heading: z.string().trim().max(300).optional(),
});

export const FaqContentSchema = z.object({
  items: z.array(FaqItemSchema).max(50),
  // Optional section video: absent → fall back to default, null → removed.
  video: FaqVideoSchema.nullish(),
});

export type FaqItem = z.infer<typeof FaqItemSchema>;
export type FaqVideo = z.infer<typeof FaqVideoSchema>;
export type FaqContent = z.infer<typeof FaqContentSchema>;
