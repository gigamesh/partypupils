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
            Are you sure you want to delete <strong>{releaseName}</strong>? This
            will permanently remove the release and all its tracks. This action
            cannot be undone.
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
