import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getEnv } from "../src/lib/env";
import { S3StorageProvider } from "../src/lib/storage/s3";

let failed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${(e as Error).message}`);
  }
}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};

async function main() {
  const e = getEnv();
  const s3 = new S3StorageProvider({
    endpointInternal: e.S3_ENDPOINT_INTERNAL,
    endpointPublic: e.S3_ENDPOINT_PUBLIC,
    region: e.S3_REGION,
    accessKeyId: e.S3_ADMIN_ACCESS_KEY,
    secretAccessKey: e.S3_ADMIN_SECRET_KEY,
  });
  const bucket = `chk-${randomUUID().slice(0, 8)}`;
  const key = "t/object";
  const body = Buffer.from("hello infinitive cloud bucket");
  console.log(`check:s3 -> internal=${e.S3_ENDPOINT_INTERNAL} public=${e.S3_ENDPOINT_PUBLIC}`);

  await step("endpoint reachable + credentials accepted", async () => assert(await s3.ping(), "ListBuckets failed"));
  await step("create bucket", async () => {
    await s3.createBucket(bucket);
    assert(await s3.bucketExists(bucket), "bucket missing after create");
  });
  await step("presigned PUT + GET round-trip", async () => {
    const put = await fetch(await s3.presignPut(bucket, key, { contentType: "text/plain" }), {
      method: "PUT",
      body,
      headers: { "content-type": "text/plain" },
    });
    assert(put.ok, `PUT ${put.status}`);
    const got = await fetch(await s3.presignGet(bucket, key));
    assert(got.ok && Buffer.from(await got.arrayBuffer()).equals(body), `GET mismatch (${got.status})`);
    const head = await s3.headObject(bucket, key);
    assert(head?.size === body.length, "HEAD size mismatch");
  });
  await step("multipart round-trip (2 parts)", async () => {
    const mk = "t/multi";
    const part1 = Buffer.alloc(5 * 1024 * 1024, 1);
    const part2 = Buffer.from("tail");
    const uploadId = await s3.createMultipart(bucket, mk);
    const parts = [];
    for (const [i, p] of [part1, part2].entries()) {
      const r = await fetch(await s3.presignUploadPart(bucket, mk, uploadId, i + 1), { method: "PUT", body: p });
      assert(r.ok, `part ${i + 1} -> ${r.status}`);
      const etag = r.headers.get("etag");
      assert(etag, "no ETag on part response");
      parts.push({ PartNumber: i + 1, ETag: etag! });
    }
    await s3.completeMultipart(bucket, mk, uploadId, parts);
    const head = await s3.headObject(bucket, mk);
    assert(head?.size === part1.length + part2.length, `size ${head?.size}`);
    await s3.deleteObject(bucket, mk);
  });
  await step(`CORS preflight from ${e.APP_URL}`, async () => {
    const url = await s3.presignPut(bucket, key);
    const r = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: new URL(e.APP_URL).origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const allow = r.headers.get("access-control-allow-origin");
    assert(
      allow === "*" || allow === new URL(e.APP_URL).origin,
      `no CORS allow-origin (status ${r.status}, got ${allow})`,
    );
  });
  await step("cleanup (delete object + bucket)", async () => {
    await s3.deleteObject(bucket, key);
    await s3.deleteBucket(bucket);
  });

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll S3 checks passed");
  process.exit(failed ? 1 : 0);
}
main();
