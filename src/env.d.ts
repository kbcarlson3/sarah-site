declare module "cloudflare:workers" {
  interface Env {
    GITHUB_TOKEN: string;
    PRODUCT_IMAGES: R2Bucket;
  }
}
