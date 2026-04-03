import { put, del } from "@vercel/blob";

export async function uploadFile(
  file: File,
  pathname: string
): Promise<{ url: string; storageKey: string }> {
  const blob = await put(pathname, file, { access: "public" });
  return { url: blob.url, storageKey: blob.url };
}

export async function deleteFile(storageKey: string) {
  await del(storageKey);
}
