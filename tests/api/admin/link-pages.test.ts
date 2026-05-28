/**
 * CRUD + slug validation tests for the LinkPage admin API.
 * Auth defaults to authed via the global mock in tests/setup.ts.
 */
import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import {
  GET as listPagesRaw,
  POST as createPageRaw,
} from "@/app/api/admin/link-pages/route";
import {
  PUT as updatePage,
  DELETE as deletePage,
} from "@/app/api/admin/link-pages/[id]/route";
import {
  POST as createItem,
  PUT as updateItem,
  DELETE as deleteItem,
} from "@/app/api/admin/link-pages/[id]/items/route";
import { prisma } from "@/lib/db";
import { makeRelease } from "../../factories";
import { createAdminSessionToken } from "@gigamusic/core";
import { env } from "@/lib/env";

// The gigamusic link-pages handlers verify the session by reading
// `req.headers.get("cookie")` (stateless), so the global vi.mock of
// `@/lib/admin-auth` doesn't gate these routes. Mint a real token signed
// with the same secret the route uses; every request below carries it.
const ADMIN_COOKIE = await (async () => {
  const token = await createAdminSessionToken({ secret: env.ADMIN_SECRET() });
  return `admin_session=${token}`;
})();

function jsonRequest(method: string, body: unknown, search = ""): NextRequest {
  return new Request(`http://test/api${search}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: ADMIN_COOKIE,
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function deleteRequest(search = ""): NextRequest {
  return new Request(`http://test/api${search}`, {
    method: "DELETE",
    headers: { cookie: ADMIN_COOKIE },
  }) as unknown as NextRequest;
}

function ctx(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

/** Empty params context for the root /api/admin/link-pages route (no [id] segment). */
const rootCtx = { params: Promise.resolve({} as Record<string, never>) };

// One-arg adapters — the route wrappers take (req, ctx) now, but the tests
// were written against the original (req)-only shape; preserving that here
// keeps the assertions intact.
const createPage = (req: NextRequest) => createPageRaw(req, rootCtx);
const listPages = () =>
  listPagesRaw(
    new Request("http://test/api/admin/link-pages", {
      headers: { cookie: ADMIN_COOKIE },
    }) as unknown as NextRequest,
    rootCtx,
  );

describe("POST /api/admin/link-pages", () => {
  it("creates a page with valid input", async () => {
    const res = await createPage(
      jsonRequest("POST", { title: "Summer Drop", slug: "summer-drop" }),
    );
    expect(res.status).toBe(201);
    const page = await res.json();
    expect(page.title).toBe("Summer Drop");
    expect(page.slug).toBe("summer-drop");
    expect(page.isPublished).toBe(true);
  });

  it("optionally associates with a release", async () => {
    const release = await makeRelease({ name: "Album" });
    const res = await createPage(
      jsonRequest("POST", {
        title: "Album Links",
        slug: "album-links",
        releaseId: release.id,
      }),
    );
    expect(res.status).toBe(201);
    const page = await res.json();
    expect(page.releaseId).toBe(release.id);
  });

  it("rejects an empty title", async () => {
    const res = await createPage(
      jsonRequest("POST", { title: "   ", slug: "ok-slug" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a slug with invalid characters", async () => {
    const res = await createPage(
      jsonRequest("POST", { title: "X", slug: "Bad Slug!" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects reserved slugs", async () => {
    const res = await createPage(
      jsonRequest("POST", { title: "X", slug: "new" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects duplicate slugs", async () => {
    await createPage(jsonRequest("POST", { title: "A", slug: "shared" }));
    const res = await createPage(
      jsonRequest("POST", { title: "B", slug: "shared" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it("returns 401 when not authenticated", async () => {
    // The gigamusic link-pages factory verifies the session statelessly
    // from req.headers.cookie, so an unauth request is one without the
    // admin_session cookie attached. The shared `jsonRequest` helper
    // always attaches it; here we build a request manually that doesn't.
    const unauthRequest = new Request("http://test/api/admin/link-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "X", slug: "unauth" }),
    }) as unknown as NextRequest;
    const res = await createPage(unauthRequest);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/link-pages", () => {
  it("lists pages most-recent first", async () => {
    await createPage(jsonRequest("POST", { title: "A", slug: "a" }));
    await createPage(jsonRequest("POST", { title: "B", slug: "b" }));
    const res = await listPages();
    expect(res.status).toBe(200);
    const pages = await res.json();
    expect(pages).toHaveLength(2);
    expect(pages[0].slug).toBe("b");
  });
});

describe("PUT /api/admin/link-pages/[id]", () => {
  it("updates page scalars", async () => {
    const created = await createPage(
      jsonRequest("POST", { title: "Old", slug: "old" }),
    ).then((r) => r.json());

    const res = await updatePage(
      jsonRequest("PUT", { title: "New", isPublished: false }),
      ctx(created.id),
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("New");
    expect(updated.isPublished).toBe(false);
    expect(updated.slug).toBe("old");
  });

  it("rejects updating to an invalid slug", async () => {
    const created = await createPage(
      jsonRequest("POST", { title: "X", slug: "x-slug" }),
    ).then((r) => r.json());
    const res = await updatePage(
      jsonRequest("PUT", { slug: "Bad Slug" }),
      ctx(created.id),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/link-pages/[id]", () => {
  it("deletes the page and cascades its items", async () => {
    const page = await createPage(
      jsonRequest("POST", { title: "X", slug: "del-me" }),
    ).then((r) => r.json());
    await createItem(
      jsonRequest("POST", { title: "Spotify", url: "https://spotify.com/x" }),
      ctx(page.id),
    );

    const res = await deletePage(deleteRequest(), ctx(page.id));
    expect(res.status).toBe(200);

    expect(
      await prisma.linkPage.findUnique({ where: { id: page.id } }),
    ).toBeNull();
    expect(
      await prisma.linkPageItem.count({ where: { pageId: page.id } }),
    ).toBe(0);
  });
});

describe("LinkPage items API", () => {
  async function makePage() {
    const res = await createPage(
      jsonRequest("POST", { title: "Page", slug: "items-page" }),
    );
    return res.json();
  }

  it("appends items at the end (auto-assigns position)", async () => {
    const page = await makePage();
    const a = await createItem(
      jsonRequest("POST", { title: "Spotify", url: "https://spotify.com/x" }),
      ctx(page.id),
    ).then((r) => r.json());
    const b = await createItem(
      jsonRequest("POST", { title: "Apple", url: "https://music.apple.com/x" }),
      ctx(page.id),
    ).then((r) => r.json());

    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("rejects items without title or url", async () => {
    const page = await makePage();
    const res = await createItem(
      jsonRequest("POST", { title: "", url: "" }),
      ctx(page.id),
    );
    expect(res.status).toBe(400);
  });

  it("updates item fields", async () => {
    const page = await makePage();
    const item = await createItem(
      jsonRequest("POST", { title: "T", url: "https://example.com" }),
      ctx(page.id),
    ).then((r) => r.json());

    const res = await updateItem(
      jsonRequest("PUT", {
        itemId: item.id,
        title: "Renamed",
        isVisible: false,
      }),
      ctx(page.id),
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Renamed");
    expect(updated.isVisible).toBe(false);
  });

  it("deletes a single item by query param", async () => {
    const page = await makePage();
    const item = await createItem(
      jsonRequest("POST", { title: "T", url: "https://example.com" }),
      ctx(page.id),
    ).then((r) => r.json());

    const res = await deleteItem(
      deleteRequest(`?itemId=${item.id}`),
      ctx(page.id),
    );
    expect(res.status).toBe(200);
    expect(
      await prisma.linkPageItem.findUnique({ where: { id: item.id } }),
    ).toBeNull();
  });
});

describe("Release → LinkPage cascade", () => {
  it("nulls releaseId when the linked release is deleted (SetNull)", async () => {
    const release = await makeRelease();
    const page = await createPage(
      jsonRequest("POST", {
        title: "X",
        slug: "rel-x",
        releaseId: release.id,
      }),
    ).then((r) => r.json());

    await prisma.release.delete({ where: { id: release.id } });
    const refetched = await prisma.linkPage.findUnique({
      where: { id: page.id },
    });
    expect(refetched).not.toBeNull();
    expect(refetched?.releaseId).toBeNull();
  });
});
