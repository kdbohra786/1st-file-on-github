import { getEnv } from "@/lib/env";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let provider: StorageProvider | undefined;

export function getStorage(): StorageProvider {
  if (!provider) {
    const e = getEnv();
    provider = new S3StorageProvider({
      endpointInternal: e.S3_ENDPOINT_INTERNAL,
      endpointPublic: e.S3_ENDPOINT_PUBLIC,
      region: e.S3_REGION,
      accessKeyId: e.S3_ADMIN_ACCESS_KEY,
      secretAccessKey: e.S3_ADMIN_SECRET_KEY,
    });
  }
  return provider;
}

/** Object key layout: <tenantPrefix>/<fileId>; the bucket is the tenant bucket. */
export const objectKey = (tenantPrefix: string, fileId: string) => `${tenantPrefix}/${fileId}`;
export type { StorageProvider } from "./types";
