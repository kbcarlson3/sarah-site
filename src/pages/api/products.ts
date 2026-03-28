import type { APIRoute } from "astro";
import { getProducts, addProduct } from "../../lib/github";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;

  try {
    const products = await getProducts(env.GITHUB_TOKEN);
    products.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return new Response(JSON.stringify(products), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error listing products:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  try {
    const formData = await request.formData();
    const title = formData.get("title") as string;
    const link = formData.get("link") as string;
    const sortOrder = formData.get("sortOrder") as string;
    const featured = formData.get("featured") === "true";
    const description = (formData.get("description") as string) || "";
    const imageFile = formData.get("image") as File | null;

    if (!title || !link) {
      return new Response(
        JSON.stringify({ error: "Title and Amazon link are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Upload image to R2 if provided
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let imagePath = "";

    if (imageFile && imageFile.size > 0) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const imageFileName = `${slug}.${ext}`;
      imagePath = `/images/products/${imageFileName}`;

      await env.PRODUCT_IMAGES.put(
        imageFileName,
        await imageFile.arrayBuffer(),
        { httpMetadata: { contentType: imageFile.type || "image/jpeg" } },
      );
    }

    const resultSlug = await addProduct(env.GITHUB_TOKEN, {
      title,
      link,
      sortOrder: parseInt(sortOrder || "1"),
      featured,
      description,
      imagePath,
    });

    return new Response(JSON.stringify({ success: true, slug: resultSlug }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error adding product:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
