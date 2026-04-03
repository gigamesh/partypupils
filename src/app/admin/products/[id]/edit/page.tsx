import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductForm } from "../../ProductForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
  });

  if (!product) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Edit: {product.name}</h1>
      <ProductForm product={product} />
    </div>
  );
}
