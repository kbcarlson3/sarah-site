import { Octokit } from "@octokit/rest";

const OWNER = "kbcarlson3";
const REPO = "sarah-site";
const BRANCH = "main";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const slug = formData.get("slug");
    const title = formData.get("title");
    const link = formData.get("link");
    const sortOrder = formData.get("sortOrder") || "1";
    const featured = formData.get("featured") === "true";
    const description = formData.get("description") || "";
    const imageFile = formData.get("image");
    const existingImage = formData.get("existingImage") || "";

    if (!slug || !title || !link) {
      return new Response(
        JSON.stringify({ error: "Slug, title, and link are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const octokit = new Octokit({ auth: token });
    const filePath = `src/content/products/${slug}.md`;

    // Get current file SHA
    const { data: currentFile } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: filePath,
    });

    // Get current commit for tree-based commit
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
    const baseTreeSha = commit.tree.sha;

    const files = [];
    let imagePath = existingImage;

    // Handle new image upload
    if (imageFile && imageFile.size > 0) {
      const imageBuffer = await imageFile.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString("base64");
      const ext = imageFile.name.split(".").pop() || "jpg";
      const imageFileName = `${slug}.${ext}`;
      imagePath = `/images/products/${imageFileName}`;

      files.push({
        path: `public/images/products/${imageFileName}`,
        content: imageBase64,
        encoding: "base64",
      });
    }

    // Get existing date from the current file
    const currentContent = Buffer.from(currentFile.content, "base64").toString("utf-8");
    const dateMatch = currentContent.match(/date:\s*(.+)/);
    const date = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

    // Create updated markdown
    const frontmatter = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `image: "${imagePath}"`,
      `link: "${link}"`,
      `date: ${date}`,
      `sortOrder: ${parseInt(sortOrder)}`,
      `featured: ${featured}`,
      "---",
    ].join("\n");

    const markdownContent = description
      ? `${frontmatter}\n${description}\n`
      : `${frontmatter}\n`;

    files.push({
      path: filePath,
      content: Buffer.from(markdownContent).toString("base64"),
      encoding: "base64",
    });

    // Create blobs and tree
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
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const { data: tree } = await octokit.git.createTree({
      owner: OWNER,
      repo: REPO,
      base_tree: baseTreeSha,
      tree: treeItems,
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner: OWNER,
      repo: REPO,
      message: `Update product: ${title}`,
      tree: tree.sha,
      parents: [latestCommitSha],
    });

    await octokit.git.updateRef({
      owner: OWNER,
      repo: REPO,
      ref: `heads/${BRANCH}`,
      sha: newCommit.sha,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error editing product:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
