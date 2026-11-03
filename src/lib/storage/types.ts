export interface PresignOptions {
  expiresInSeconds?: number;
  contentType?: string;
  contentLength?: number;
  downloadFileName?: string;
  inline?: boolean;
}

export interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

export interface StorageProvider {
  createBucket(bucket: string): Promise<void>;
  deleteBucket(bucket: string): Promise<void>;
  bucketExists(bucket: string): Promise<boolean>;
  headObject(bucket: string, key: string): Promise<{ size: number; etag?: string; contentType?: string } | null>;
  deleteObject(bucket: string, key: string): Promise<void>;
  presignPut(bucket: string, key: string, opts?: PresignOptions): Promise<string>;
  presignGet(bucket: string, key: string, opts?: PresignOptions): Promise<string>;
  createMultipart(bucket: string, key: string, contentType?: string): Promise<string>;
  presignUploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string>;
  completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;
  abortMultipart(bucket: string, key: string, uploadId: string): Promise<void>;
  ping(): Promise<boolean>;
}
