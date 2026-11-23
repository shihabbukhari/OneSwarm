import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { env } from "./env";
import { signDownload } from "./security";

/**
 * File storage behind one small interface: local disk for development and an
 * S3-compatible bucket (Cloudflare R2) in production.
 */
export interface Storage {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  /** A short-lived URL the browser can download from. */
  signedUrl(params: { key: string; fileId: string; name: string; mime: string }): Promise<string>;
}

const DOWNLOAD_TTL_SECONDS = 15 * 60;

class LocalStorage implements Storage {
  private root = resolve(process.cwd(), env.storageDir);

  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async stream(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    await stat(path);
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async signedUrl({ fileId }: { fileId: string }): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS;
    return `/api/files/${fileId}/download?exp=${exp}&sig=${signDownload(fileId, exp)}`;
  }
}

class S3Storage implements Storage {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      endpoint: env.s3.endpoint || undefined,
      region: env.s3.region,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  })();

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: mime }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.stream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }

  async stream(key: string): Promise<Readable> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const res = await client.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return res.Body as Readable;
  }

  async remove(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  }

  async signedUrl({
    key,
    name,
    mime,
  }: {
    key: string;
    name: string;
    mime: string;
  }): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.clientPromise;
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        ResponseContentType: mime,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(name)}"`,
      }),
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    );
  }
}

export function createStorage(): Storage {
  if (env.storageDriver === "s3") {
    if (!env.s3.bucket || !env.s3.accessKeyId || !env.s3.secretAccessKey) {
      throw new Error(
        "STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
      );
    }
    return new S3Storage();
  }
  return new LocalStorage();
}
