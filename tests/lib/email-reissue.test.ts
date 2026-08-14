/**
 * The reissue email is composed from `@gigamusic/email.renderPurchaseConfirmation`
 * by swapping one sentence, so the thing worth pinning is that the swap actually
 * lands — if the upstream copy ever changes, this fails here instead of a real
 * customer receiving "Thank you for your purchase!" about an order from last week.
 *
 * `@/lib/email` is globally mocked in tests/setup.ts; `importActual` gets the real one.
 */
import { describe, it, expect, vi } from "vitest";
import { renderPurchaseConfirmation } from "@gigamusic/email";

async function realEmailModule() {
  return vi.importActual<typeof import("@/lib/email")>("@/lib/email");
}

const args = {
  verifyUrl: "https://partypupils.com/orders/verify?token=abc",
  itemNames: ["Yacht House Vol 3"],
  totalCents: 2500,
  expiryDays: 30,
};

describe("renderDownloadReissue", () => {
  it("swaps the purchase intro for reissue copy", async () => {
    const { renderDownloadReissue, EMAIL_BRANDING } = await realEmailModule();
    const { html } = renderDownloadReissue(args);

    const confirmation = renderPurchaseConfirmation({
      branding: EMAIL_BRANDING,
      verifyUrl: args.verifyUrl,
      itemNames: args.itemNames,
      totalCents: args.totalCents,
    });

    // The sentence we replace must still exist upstream, or the swap is a no-op.
    expect(confirmation.html).toContain("Thank you for your purchase!");
    expect(html).not.toContain("Thank you for your purchase!");
    expect(html).toContain("refreshed the download link");
    expect(html).toContain("next 30 days");
  });

  it("keeps the branded shell, item list, total and CTA from the shared template", async () => {
    const { renderDownloadReissue } = await realEmailModule();
    const { subject, html } = renderDownloadReissue(args);

    expect(subject).toBe("Your Party Pupils Download Link");
    expect(html).toContain("Yacht House Vol 3");
    expect(html).toContain("$25.00");
    expect(html).toContain(args.verifyUrl);
    expect(html).toContain("Download My Music");
  });

  it("escapes item names supplied by the catalog", async () => {
    const { renderDownloadReissue } = await realEmailModule();
    const { html } = renderDownloadReissue({
      ...args,
      itemNames: ["<script>alert(1)</script>"],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
