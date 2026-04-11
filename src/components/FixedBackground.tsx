import Image from "@/components/Image";

export function FixedBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <Image
        src="/images/ocean-bg.jpg"
        alt=""
        fill
        priority
        className="object-cover object-[50%_15%]"
        sizes="100vw"
      />
      <div
        className="absolute inset-0"
        style={{ background: "rgba(31, 112, 178, 0.3)" }}
      />
    </div>
  );
}
