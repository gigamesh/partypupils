"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface Props {
  pageId: number;
  pageTitle: string;
  redirectOnDelete?: boolean;
}

export function DeleteLinkPageButton({
  pageId,
  pageTitle,
  redirectOnDelete,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/admin/link-pages/${pageId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      setDeleting(false);
      alert("Failed to delete link page");
      return;
    }

    if (redirectOnDelete) {
      router.push("/admin/link-pages");
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete link page</DialogTitle>
          <DialogDescription>
            Delete <strong>{pageTitle}</strong>? Its public URL will return 404.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
