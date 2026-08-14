"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  orderId: number;
  orderEmail: string;
}

interface ReissueSuccess {
  email: string;
  previousEmail: string | null;
  verifyUrl: string;
  emailSent: boolean;
  emailError: string | null;
  linkExpiresInDays: number;
}

export function ReissueDownloadsButton({ orderId, orderEmail }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(orderEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReissueSuccess | null>(null);
  const [copied, setCopied] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== orderEmail.trim().toLowerCase();

  function reset() {
    setEmail(orderEmail);
    setEditingEmail(false);
    setSendEmail(true);
    setSubmitting(false);
    setError(null);
    setResult(null);
    setCopied(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/orders/reissue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          email: email.trim(),
          // The address field is read-only until the admin explicitly opts into
          // changing it, so reaching here with a changed address is already a
          // deliberate act — this flag is what the API requires to write it.
          confirmEmailChange: emailChanged,
          sendEmail,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }

      setResult(body as ReissueSuccess);
      router.refresh();
    } catch {
      setError("Network error — the request never reached the server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Reissue
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reissue downloads — order #{orderId}</DialogTitle>
          <DialogDescription>
            Creates a new download link for this order and emails the customer a
            fresh magic link to their downloads. Links already sent keep working.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div
              className={
                result.emailSent
                  ? "rounded-lg border border-neon/40 bg-neon/10 p-3 text-sm"
                  : "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
              }
            >
              {result.emailSent ? (
                <p>
                  Sent to <strong>{result.email}</strong>. The link works for the
                  next {result.linkExpiresInDays} days.
                </p>
              ) : (
                <p>
                  New link created, but the email{" "}
                  {result.emailError ? "failed to send" : "was not sent"}. Copy
                  the link below and send it to <strong>{result.email}</strong>{" "}
                  another way.
                  {result.emailError && (
                    <span className="block mt-1 text-xs opacity-80">
                      {result.emailError}
                    </span>
                  )}
                </p>
              )}
            </div>

            {result.previousEmail && (
              <p className="text-xs text-muted-foreground">
                Order email changed from {result.previousEmail} to {result.email}.
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor={`reissue-url-${orderId}`}>Download link</Label>
              <div className="flex gap-2">
                <Input
                  id={`reissue-url-${orderId}`}
                  readOnly
                  value={result.verifyUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(result.verifyUrl)}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can download every order for{" "}
                {result.email}. Share it only with the customer.
              </p>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor={`reissue-email-${orderId}`}>Send to</Label>
              <div className="flex gap-2">
                <Input
                  id={`reissue-email-${orderId}`}
                  type="email"
                  value={email}
                  readOnly={!editingEmail}
                  disabled={submitting}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {!editingEmail && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setEditingEmail(true)}
                  >
                    Correct
                  </Button>
                )}
              </div>
            </div>

            {editingEmail && emailChanged && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-medium">This rewrites the order.</p>
                <p className="mt-1">
                  Order #{orderId} will be moved from {orderEmail} to{" "}
                  {email.trim() || "…"}, and that address will be able to
                  download it from then on. Only do this for a genuine typo you
                  have confirmed with the customer.
                </p>
              </div>
            )}

            <Label className="text-sm font-normal">
              <input
                type="checkbox"
                checked={sendEmail}
                disabled={submitting}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="size-4 accent-neon"
              />
              Email the link to the customer
            </Label>
            {!sendEmail && (
              <p className="text-xs text-muted-foreground">
                The link will only be shown here — nothing is sent.
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button
                variant={emailChanged ? "destructive" : "default"}
                onClick={handleSubmit}
                disabled={submitting || email.trim() === ""}
              >
                {submitting
                  ? "Working..."
                  : emailChanged
                    ? "Change email & reissue"
                    : sendEmail
                      ? "Reissue & send"
                      : "Reissue link"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
