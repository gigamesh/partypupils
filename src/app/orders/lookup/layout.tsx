import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find Your Orders",
};

export default function OrderLookupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
