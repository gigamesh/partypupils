import { SeatedTourWidget } from "@/components/SeatedTourWidget";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tour Dates | Party Pupils",
  description:
    "See upcoming Party Pupils tour dates and get tickets to a show near you.",
};

export default function TourPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="neon-glow uppercase">Tour Dates</h1>
      <div className="glass-panel px-4 py-8 sm:px-8">
        <SeatedTourWidget />
      </div>
    </div>
  );
}
