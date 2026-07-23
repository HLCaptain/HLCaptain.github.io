import assert from "node:assert/strict";
import test from "node:test";
import { cleanupBranchPreviewDeployments, createCloudflareClient } from "../scripts/cloudflare-preview-cleanup.mjs";

test("cleanup retains the newest exact-branch preview and deletes older pages", async () => {
  const branch = "agent/cleanup-cloudflare-previews";
  const events = [];
  const client = {
    async listPage(page) {
      events.push(`list:${page}`);
      return page === 1
        ? {
            result: [
              {
                id: "newest",
                created_on: "2026-07-23T12:00:00Z",
                environment: "preview",
                deployment_trigger: { metadata: { branch } }
              },
              {
                id: "production",
                created_on: "2026-07-23T11:00:00Z",
                environment: "production",
                deployment_trigger: { metadata: { branch } }
              },
              {
                id: "other-branch",
                created_on: "2026-07-23T10:00:00Z",
                environment: "preview",
                deployment_trigger: { metadata: { branch: "agent/other" } }
              }
            ],
            result_info: { total_pages: 2 }
          }
        : {
            result: [
              {
                id: "oldest",
                created_on: "2026-07-21T12:00:00Z",
                environment: "preview",
                deployment_trigger: { metadata: { branch } }
              },
              {
                id: "older",
                created_on: "2026-07-22T12:00:00Z",
                environment: "preview",
                deployment_trigger: { metadata: { branch } }
              }
            ],
            result_info: { total_pages: 2 }
          };
    },
    async deleteDeployment(id) {
      events.push(`delete:${id}`);
    }
  };

  const result = await cleanupBranchPreviewDeployments(client, branch);
  assert.deepEqual(result, {
    retainedId: "newest",
    deletedIds: ["older", "oldest"]
  });
  assert.deepEqual(events, ["list:1", "list:2", "delete:older", "delete:oldest"]);
});

test("cleanup forces deletion of aliased non-production deployments", async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ success: true, result: null }));
  };
  const client = createCloudflareClient({
    accountId: "account",
    apiToken: "token",
    project: "hlcaptain-site",
    fetchImpl
  });

  await client.deleteDeployment("deployment-id");

  assert.equal(request.url.pathname, "/client/v4/accounts/account/pages/projects/hlcaptain-site/deployments/deployment-id");
  assert.equal(request.url.search, "?force=true");
  assert.equal(request.init.method, "DELETE");
});
