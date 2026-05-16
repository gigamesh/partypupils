"use client";

import { useCallback } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaInvalid?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * WYSIWYG editor used in the FAQ admin. Output is HTML produced by Tiptap
 * with a constrained extension set: paragraphs, bold, italic, and links only.
 * That schema limit is the only sanitization layer — keep extensions narrow
 * if you don't want admins able to inject more tag types.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaInvalid,
  ariaLabel,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_p:not(:last-child)]:mb-2 [&_a]:underline [&_a]:text-neon",
          className,
        ),
        ...(ariaInvalid ? { "aria-invalid": "true" } : {}),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChange(html);
    },
  });

  if (!editor) {
    return (
      <div className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      window.alert("Links must start with http:// or https://");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant={editor.isActive("bold") ? "default" : "outline"}
        size="xs"
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
      >
        <span className="font-bold">B</span>
      </Button>
      <Button
        type="button"
        variant={editor.isActive("italic") ? "default" : "outline"}
        size="xs"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
      >
        <span className="italic">I</span>
      </Button>
      <Button
        type="button"
        variant={editor.isActive("link") ? "default" : "outline"}
        size="xs"
        onClick={setLink}
        aria-label="Insert or edit link"
        aria-pressed={editor.isActive("link")}
      >
        Link
      </Button>
      {editor.isActive("link") && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
          aria-label="Remove link"
        >
          Unlink
        </Button>
      )}
    </div>
  );
}
