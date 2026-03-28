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

function buildMarkdown(data: ProductInput, date: string): string {
  const frontmatter = [
    "---",
    `title: "${(data.title || "").replace(/"/g, '\\"')}"`,
    `image: "${data.imagePath || ""}"`,
    `link: "${data.link || ""}"`,
    `date: ${date}`,
    `sortOrder: ${data.sortOrder ?? 1}`,
    `featured: ${data.featured ?? false}`,
    "---",
  ].join("\n");

  return data.description
    ? `${frontmatter}\n${data.description}\n`
    : `${frontmatter}\n`;
}

function buildMarkdownFromProduct(product: Product, newSortOrder: number): string {
  const frontmatter = [
    "---",
    `title: "${(product.title || "").replace(/"/g, '\\"')}"`,
    `image: "${product.image || ""}"`,
    `link: "${product.link || ""}"`,
    `date: ${product.date}`,
    `sortOrder: ${newSortOrder}`,
    `featured: ${product.featured}`,
    "---",
  ].join("\n");

  return product.description
    ? `${frontmatter}\n${product.description}\n`
    : `${frontmatter}\n`;
}

export async function getProducts(token: string): Promise<Product[]> {
  const octokit = new Octokit({ auth: token });

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

  const products: Product[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".md")) continue;

    const { data: fileData } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: file.path,
    });

    if (!("content" in fileData)) continue;

    const content = Buffer.from(fileData.content, "base64").toString("utf-8");
    const slug = file.name.replace(".md", "");
    products.push(parseFrontmatter(content, slug, fileData.sha));
  }

  return products;
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

  const treeItems = [];
  for (const file of files) {
    const { data: blob } = await octokit.git.createBlob({
      owner: OWNER,
      repo: REPO,
      content: file.content,
      encoding: file.encoding,
    });
    treeItems.push({
      path: file.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    });
  }

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

async function getBumpedFiles(
  token: string,
  targetOrder: number,
  excludeSlug?: string,
): Promise<Array<{ path: string; content: string; encoding: string }>> {
  const products = await getProducts(token);
  const toBump = products.filter(
    (p) => p.sortOrder >= targetOrder && p.slug !== excludeSlug,
  );

  return toBump.map((p) => {
    const markdown = buildMarkdownFromProduct(p, p.sortOrder + 1);
    return {
      path: `${PRODUCTS_PATH}/${p.slug}.md`,
      content: Buffer.from(markdown).toString("base64"),
      encoding: "base64",
    };
  });
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
  const markdown = buildMarkdown(data, date);

  const bumpedFiles = await getBumpedFiles(token, data.sortOrder ?? 1);

  await commitFiles(
    octokit,
    [
      {
        path: `${PRODUCTS_PATH}/${slug}.md`,
        content: Buffer.from(markdown).toString("base64"),
        encoding: "base64",
      },
      ...bumpedFiles,
    ],
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
  const filePath = `${PRODUCTS_PATH}/${slug}.md`;

  // Get existing date
  const { data: currentFile } = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: filePath,
  });

  let date = new Date().toISOString();
  if ("content" in currentFile) {
    const currentContent = Buffer.from(currentFile.content, "base64").toString(
      "utf-8",
    );
    const dateMatch = currentContent.match(/date:\s*(.+)/);
    if (dateMatch) date = dateMatch[1].trim();
  }

  const markdown = buildMarkdown(data, date);

  const bumpedFiles = await getBumpedFiles(token, data.sortOrder ?? 1, slug);

  await commitFiles(
    octokit,
    [
      {
        path: filePath,
        content: Buffer.from(markdown).toString("base64"),
        encoding: "base64",
      },
      ...bumpedFiles,
    ],
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
