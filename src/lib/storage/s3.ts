import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { CompletedPart, PresignOptions, StorageProvider } from "./types";

export interface S3Config {
  endpointInternal: string;
  endpointPublic: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const make = (endpoint: string, c: S3Config) =>
  new S3Client({
    endpoint,
    region: c.region,
    forcePathStyle: true,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

/** S3-compatible provider (SeaweedFS, MinIO, R2, AWS). Server calls use the internal endpoint; presigning uses the public one. */
export class S3StorageProvider implements StorageProvider {
  private internal: S3Client;
  private pub: S3Client;

  constructor(cfg: S3Config) {
    this.internal = make(cfg.endpointInternal, cfg);
    this.pub = make(cfg.endpointPublic, cfg);
  }

  async createBucket(bucket: string) {
    await this.internal.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  async deleteBucket(bucket: string) {
    await this.internal.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  async bucketExists(bucket: string) {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch {
      return false;
    }
  }
  async headObject(bucket: string, key: string) {
    try {
      const r = await this.internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: r.ContentLength ?? 0, etag: r.ETag, contentType: r.ContentType };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (e as Error).name === "NotFound") return null;
      throw e;
    }
  }
  async deleteObject(bucket: string, key: string) {
    await this.internal.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  private disposition(o: PresignOptions) {
    if (!o.downloadFileName && o.inline !== false) return o.inline ? "inline" : undefined;
    const name = encodeURIComponent(o.downloadFileName ?? "download");
    return `${o.inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`;
  }

  presignPut(bucket: string, key: string, o: PresignOptions = {}) {
    return getSignedUrl(
      this.pub,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: o.contentType, ContentLength: o.contentLength }),
      { expiresIn: o.expiresInSeconds ?? 600 },
    );
  }
  presignGet(bucket: string, key: string, o: PresignOptions = {}) {
    return getSignedUrl(
      this.pub,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: o.contentType,
        ResponseContentDisposition: this.disposition(o),
      }),
      { expiresIn: o.expiresInSeconds ?? 600 },
    );
  }
  async createMultipart(bucket: string, key: string, contentType?: string) {
    const r = await this.internal.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    );
    if (!r.UploadId) throw new Error("No UploadId returned");
    return r.UploadId;
  }
  presignUploadPart(bucket: string, key: string, uploadId: string, partNumber: number, expiresInSeconds = 900) {
    return getSignedUrl(
      this.pub,
      new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
      { expiresIn: expiresInSeconds },
    );
  }
  async completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[]) {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) },
      }),
    );
  }
  async abortMultipart(bucket: string, key: string, uploadId: string) {
    await this.internal.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
  }
  async ping() {
    try {
      await this.internal.send(new ListBucketsCommand({}));
      return true;
    } catch {
      return false;
    }
  }
}
