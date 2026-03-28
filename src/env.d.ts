type Runtime = import('@astrojs/cloudflare').Runtime<{
  GITHUB_TOKEN: string;
  PRODUCT_IMAGES: R2Bucket;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
