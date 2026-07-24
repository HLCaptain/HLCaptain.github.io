import { pathToFileURL } from "node:url";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const PAGE_SIZE = 10;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function responseJson(response, label) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const messages = payload?.errors?.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(`${label} failed with ${response.status}${messages ? `: ${messages}` : ""}.`);
  }
  if (payload?.success !== true) throw new Error(`${label} was not successful.`);
  return payload;
}

export function createCloudflareClient({ accountId, apiToken, project, fetchImpl = fetch }) {
  if (!accountId || !apiToken || !project) throw new Error("Cloudflare account, token, and project are required.");
  const deploymentsUrl = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}/deployments`;

  const request = async (url, method = "GET") => {
    const response = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(30_000)
    });
    return responseJson(response, `Cloudflare ${method} ${url.pathname}`);
  };

  return {
    async listPage(page) {
      const url = new URL(deploymentsUrl);
      url.searchParams.set("env", "preview");
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(PAGE_SIZE));
      return request(url);
    },
    async deleteDeployment(deploymentId) {
      if (!deploymentId) throw new Error("Cloudflare deployment id is required.");
      const url = new URL(`${deploymentsUrl}/${encodeURIComponent(deploymentId)}`);
      url.searchParams.set("force", "true");
      return request(url, "DELETE");
    }
  };
}

export async function collectPreviewDeployments(client) {
  const deployments = [];

  for (let page = 1; page <= 1_000; page += 1) {
    const payload = await client.listPage(page);
    if (!Array.isArray(payload?.result)) throw new Error("Cloudflare deployment list was malformed.");
    deployments.push(...payload.result);

    const totalPages = Number(payload.result_info?.total_pages);
    if (Number.isInteger(totalPages) && totalPages >= 0) {
      if (page >= totalPages) return deployments;
    } else if (payload.result.length < PAGE_SIZE) {
      return deployments;
    }
  }

  throw new Error("Cloudflare deployment pagination exceeded 1,000 pages.");
}

function isBranchPreview(deployment, branch) {
  return deployment?.environment === "preview"
    && deployment?.deployment_trigger?.metadata?.branch === branch;
}

export async function cleanupBranchPreviewDeployments(client, branch) {
  if (!branch) throw new Error("PR branch is required.");
  const deployments = await collectPreviewDeployments(client);
  const matching = deployments
    .filter((deployment) => isBranchPreview(deployment, branch))
    .map((deployment) => {
      const createdAt = Date.parse(deployment.created_on);
      if (typeof deployment.id !== "string" || !deployment.id || !Number.isFinite(createdAt)) {
        throw new Error("A matching Cloudflare preview deployment was malformed.");
      }
      return { id: deployment.id, createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const [retained, ...superseded] = matching;
  for (const deployment of superseded) await client.deleteDeployment(deployment.id);

  return {
    retainedId: retained?.id ?? null,
    deletedIds: superseded.map((deployment) => deployment.id)
  };
}

async function main() {
  const branch = requiredEnv("PR_BRANCH");
  const client = createCloudflareClient({
    accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
    apiToken: requiredEnv("CLOUDFLARE_API_TOKEN"),
    project: requiredEnv("CLOUDFLARE_PAGES_PROJECT")
  });
  const result = await cleanupBranchPreviewDeployments(client, branch);
  console.log(
    `Deleted ${result.deletedIds.length} superseded Cloudflare preview deployment(s) for ${branch}; retained ${result.retainedId ?? "none"}.`
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
