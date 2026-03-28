import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ params }) => {
  const path = params.path;
  if (!path) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = env.PRODUCT_IMAGES;
  const object = await bucket.get(path);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "image/jpeg",
  );

  return new Response(object.body, { headers });
};
