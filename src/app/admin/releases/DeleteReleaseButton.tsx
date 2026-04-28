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

interface DeleteReleaseButtonProps {
  releaseId: number;
  releaseName: string;
  redirectOnDelete?: boolean;
}

export function DeleteReleaseButton({
  releaseId,
  releaseName,
  redirectOnDelete,
}: DeleteReleaseButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/admin/releases/${releaseId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      setDeleting(false);
      alert("Failed to delete release");
      return;
    }

    if (redirectOnDelete) {
      router.push("/admin");
    } else {
      router.refresh();
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={<Button variant="destructive" size="sm" />}
      >
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete release</DialogTitle>
          <DialogDescription>
            <strong>Customers who purchased this release in the past will permanently lose
            access to their downloads.</strong> The release, all its tracks, and the audio files
            in storage will be removed.
            <br />
            <br />
            If you just want to hide it from the public site, untick <em>Published</em> on the
            edit page instead — that preserves all customer access.
            <br />
            <br />
            Delete <strong>{releaseName}</strong> anyway? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
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
