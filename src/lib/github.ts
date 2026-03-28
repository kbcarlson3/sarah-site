import { Buffer } from "node:buffer";
import { Octokit } from "@octokit/rest";

const OWNER = "kbcarlson3";
const REPO = "sarah-site";
const BRANCH = "main";
const PRODUCTS_PATH = "src/content/products";

export interface Product {
  slug: string;
  title: string;
  image: string;
  link: string;
  date: string;
  sortOrder: number;
  featured: boolean;
  description: string;
  sha: string;
}

export interface ProductInput {
  title: string;
  link: string;
  sortOrder?: number;
  featured?: boolean;
  description?: string;
  imagePath?: string;
}

interface MarkdownFields {
  title: string;
  image: string;
  link: string;
  date: string;
  sortOrder: number;
  featured: boolean;
  description?: string;
}

function parseFrontmatter(
  content: string,
  slug: string,
  sha: string,
): Product {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    return {
      slug,
      title: slug,
      image: "",
      link: "",
      date: "",
      sortOrder: 1,
      featured: false,
      description: "",
      sha,
    };
  }

  const fm = frontmatterMatch[1];
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

  return {
    slug,
    title: fm.match(/title:\s*"?([^"\n]*)"?/)?.[1] || slug,
    image: fm.match(/image:\s*"?([^"\n]*)"?/)?.[1] || "",
    link: fm.match(/link:\s*"?([^"\n]*)"?/)?.[1] || "",
    date: fm.match(/date:\s*(.+)/)?.[1]?.trim() || "",
    sortOrder: parseInt(fm.match(/sortOrder:\s*(\d+)/)?.[1] || "1"),
    featured: fm.match(/featured:\s*(true|false)/)?.[1] === "true",
    description: body,
    sha,
  };
}

function buildMarkdown(fields: MarkdownFields): string {
  const frontmatter = [
    "---",
    `title: "${(fields.title || "").replace(/"/g, '\\"')}"`,
    `image: "${fields.image || ""}"`,
    `link: "${fields.link || ""}"`,
    `date: ${fields.date}`,
    `sortOrder: ${fields.sortOrder}`,
    `featured: ${fields.featured}`,
    "---",
  ].join("\n");

  return fields.description
    ? `${frontmatter}\n${fields.description}\n`
    : `${frontmatter}\n`;
}

function toBase64File(path: string, content: string) {
  return {
    path,
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  };
}

async function fetchProducts(octokit: Octokit): Promise<Product[]> {
  let files: Array<{ name: string; path: string }>;
  try {
    const { data } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: PRODUCTS_PATH,
    });
    files = Array.isArray(data) ? data : [];
  } catch {
    files = [];
  }

  const mdFiles = files.filter((f) => f.name.endsWith(".md"));

  const products = await Promise.all(
    mdFiles.map(async (file) => {
      const { data: fileData } = await octokit.repos.getContent({
        owner: OWNER,
        repo: REPO,
        path: file.path,
      });
      if (!("content" in fileData)) return null;
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      return parseFrontmatter(content, file.name.replace(".md", ""), fileData.sha);
    }),
  );

  return products.filter((p): p is Product => p !== null);
}

export async function getProducts(token: string): Promise<Product[]> {
  return fetchProducts(new Octokit({ auth: token }));
}

async function commitFiles(
  octokit: Octokit,
  files: Array<{ path: string; content: string; encoding: string }>,
  message: string,
): Promise<void> {
  const { data: ref } = await octokit.git.getRef({
    owner: OWNER,
    repo: REPO,
    ref: `heads/${BRANCH}`,
  });
  const latestCommitSha = ref.object.sha;

  const { data: commit } = await octokit.git.getCommit({
    owner: OWNER,
    repo: REPO,
    commit_sha: latestCommitSha,
  });

  const treeItems = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.git.createBlob({
        owner: OWNER,
        repo: REPO,
        content: file.content,
        encoding: file.encoding,
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.sha,
      };
    }),
  );

  const { data: tree } = await octokit.git.createTree({
    owner: OWNER,
    repo: REPO,
    base_tree: commit.tree.sha,
    tree: treeItems,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: OWNER,
    repo: REPO,
    message,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  await octokit.git.updateRef({
    owner: OWNER,
    repo: REPO,
    ref: `heads/${BRANCH}`,
    sha: newCommit.sha,
  });
}

function getBumpedFiles(
  products: Product[],
  targetOrder: number,
  excludeSlug?: string,
) {
  return products
    .filter((p) => p.sortOrder >= targetOrder && p.slug !== excludeSlug)
    .map((p) =>
      toBase64File(
        `${PRODUCTS_PATH}/${p.slug}.md`,
        buildMarkdown({ ...p, image: p.image, sortOrder: p.sortOrder + 1 }),
      ),
    );
}

export async function addProduct(
  token: string,
  data: ProductInput,
): Promise<string> {
  const octokit = new Octokit({ auth: token });
  const slug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date().toISOString();
  const sortOrder = data.sortOrder ?? 1;

  const products = await fetchProducts(octokit);
  const bumpedFiles = getBumpedFiles(products, sortOrder);

  const markdown = buildMarkdown({
    title: data.title,
    image: data.imagePath || "",
    link: data.link,
    date,
    sortOrder,
    featured: data.featured ?? false,
    description: data.description,
  });

  await commitFiles(
    octokit,
    [toBase64File(`${PRODUCTS_PATH}/${slug}.md`, markdown), ...bumpedFiles],
    `Add product: ${data.title}`,
  );

  return slug;
}

export async function editProduct(
  token: string,
  slug: string,
  data: ProductInput,
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  const sortOrder = data.sortOrder ?? 1;

  const products = await fetchProducts(octokit);
  const existing = products.find((p) => p.slug === slug);
  const date = existing?.date || new Date().toISOString();

  const bumpedFiles = getBumpedFiles(products, sortOrder, slug);

  const markdown = buildMarkdown({
    title: data.title,
    image: data.imagePath || "",
    link: data.link,
    date,
    sortOrder,
    featured: data.featured ?? false,
    description: data.description,
  });

  await commitFiles(
    octokit,
    [toBase64File(`${PRODUCTS_PATH}/${slug}.md`, markdown), ...bumpedFiles],
    `Update product: ${data.title}`,
  );
}

export async function deleteProduct(
  token: string,
  slug: string,
): Promise<void> {
  const octokit = new Octokit({ auth: token });
  const filePath = `${PRODUCTS_PATH}/${slug}.md`;

  const { data: fileData } = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: filePath,
  });

  if (!("sha" in fileData)) throw new Error("File not found");

  await octokit.repos.deleteFile({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    message: `Delete product: ${slug}`,
    sha: fileData.sha,
    branch: BRANCH,
  });
}
