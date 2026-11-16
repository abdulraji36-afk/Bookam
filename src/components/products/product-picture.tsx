import { productImage } from "@/lib/product-images";

/** A product's picture, or its first letters when it has none. */
export function ProductPicture({ sku, name, size = "md" }: { sku: string | null; name: string; size?: "md" | "lg" }) {
  const src = productImage(sku);
  const box = size === "lg" ? "size-28" : "size-12";
  if (src) {
    return (
      // A small local picture: plain img keeps it simple and needs no image server.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size === "lg" ? 112 : 48} height={size === "lg" ? 112 : 48} className={`${box} shrink-0 rounded-md bg-paper object-contain`} />
    );
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-md bg-paper text-sm font-extrabold text-ink-soft`}>
      {letters}
    </span>
  );
}
