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
    const { slug } = await req.json();

    if (!slug) {
      return new Response(
        JSON.stringify({ error: "Product slug is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const octokit = new Octokit({ auth: token });
    const filePath = `src/content/products/${slug}.md`;

    // Get file SHA (required for deletion)
    const { data: fileData } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: filePath,
    });

    // Delete the file
    await octokit.repos.deleteFile({
      owner: OWNER,
      repo: REPO,
      path: filePath,
      message: `Delete product: ${slug}`,
      sha: fileData.sha,
      branch: BRANCH,
    });

    // Try to delete the associated image too
    try {
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      const imageMatch = content.match(/image:\s*"?\/images\/products\/([^"\n]*)"?/);
      if (imageMatch) {
        const imagePath = `public/images/products/${imageMatch[1]}`;
        const { data: imgData } = await octokit.repos.getContent({
          owner: OWNER,
          repo: REPO,
          path: imagePath,
        });
        await octokit.repos.deleteFile({
          owner: OWNER,
          repo: REPO,
          path: imagePath,
          message: `Delete image for: ${slug}`,
          sha: imgData.sha,
          branch: BRANCH,
        });
      }
    } catch {
      // Image might not exist or be an external URL — that's fine
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error deleting product:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
