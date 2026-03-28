import type { APIRoute } from "astro";
import { editProduct, deleteProduct } from "../../../lib/github";

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const slug = params.slug;

  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await request.formData();
    const title = formData.get("title") as string;
    const link = formData.get("link") as string;
    const sortOrder = formData.get("sortOrder") as string;
    const featured = formData.get("featured") === "true";
    const description = (formData.get("description") as string) || "";
    const imageFile = formData.get("image") as File | null;
    const existingImage = (formData.get("existingImage") as string) || "";

    if (!title || !link) {
      return new Response(
        JSON.stringify({ error: "Title and link are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let imagePath = existingImage;

    // Upload new image to R2 if provided
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

    await editProduct(env.GITHUB_TOKEN, slug, {
      title,
      link,
      sortOrder: parseInt(sortOrder || "1"),
      featured,
      description,
      imagePath,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error editing product:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const slug = params.slug;

  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Delete image from R2 (try common extensions)
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      await env.PRODUCT_IMAGES.delete(`${slug}.${ext}`);
    }

    await deleteProduct(env.GITHUB_TOKEN, slug);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
