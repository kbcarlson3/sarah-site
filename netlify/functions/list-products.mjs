import { Octokit } from "@octokit/rest";

const OWNER = "kbcarlson3";
const REPO = "sarah-site";

export default async (req) => {
  if (req.method !== "GET") {
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
    const octokit = new Octokit({ auth: token });

    let files;
    try {
      const { data } = await octokit.repos.getContent({
        owner: OWNER,
        repo: REPO,
        path: "src/content/products",
      });
      files = Array.isArray(data) ? data : [];
    } catch (e) {
      // Directory doesn't exist or is empty
      files = [];
    }

    const products = [];
    for (const file of files) {
      if (!file.name.endsWith(".md")) continue;

      const { data: fileData } = await octokit.repos.getContent({
        owner: OWNER,
        repo: REPO,
        path: file.path,
      });

      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const title =
          frontmatter.match(/title:\s*"?([^"\n]*)"?/)?.[1] || file.name;
        const image = frontmatter.match(/image:\s*"?([^"\n]*)"?/)?.[1] || "";
        const link = frontmatter.match(/link:\s*"?([^"\n]*)"?/)?.[1] || "";
        const sortOrder =
          parseInt(frontmatter.match(/sortOrder:\s*(\d+)/)?.[1]) || 1;
        const featured =
          frontmatter.match(/featured:\s*(true|false)/)?.[1] === "true";
        const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();

        products.push({
          slug: file.name.replace(".md", ""),
          title,
          image,
          link,
          sortOrder,
          featured,
          description: body,
          sha: fileData.sha,
        });
      }
    }

    products.sort((a, b) => a.sortOrder - b.sortOrder);

    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error listing products:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
