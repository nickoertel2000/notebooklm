import { CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Credentials kommen aus der Umgebung (lokal AWS_*; im Amplify-Hosting via IAM-Rolle).
export const s3 = new S3Client({ region: process.env.AWS_REGION })
export const BUCKET = process.env.S3_BUCKET_NAME as string

// Presigned PUT-URL, damit der Client eine Datei direkt nach S3 lädt.
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: 600
  })
}

// Presigned GET-URL, z. B. damit der Audio-Player eine Datei direkt aus S3 streamt.
export function presignDownload(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 })
}

export async function putText(key: string, body: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "text/plain; charset=utf-8"
    })
  )
}

export async function putBinary(key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
}

// Stösst die ingest-Lambda erneut an, indem das vorhandene Objekt auf sich
// selbst kopiert wird (feuert ein ObjectCreated:Copy-Event). MetadataDirective
// REPLACE ist nötig, sonst lehnt S3 das Kopieren auf denselben Key ab.
export async function retriggerIngest(key: string) {
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`,
      Key: key,
      MetadataDirective: "REPLACE",
      Metadata: { retriggeredat: new Date().toISOString() }
    })
  )
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// Löscht alle Objekte unter einem Prefix (z. B. ein ganzes Notebook).
export async function deleteByPrefix(prefix: string) {
  let token: string | undefined
  do {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
    const objects = list.Contents ?? []
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) }
        })
      )
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (token)
}

// Pfadschema: notebookId und sourceId stecken im Key, damit die Lambda die
// Quelle eindeutig zuordnen kann.
export function sourceKey(notebookId: string, sourceId: string, filename: string) {
  return `notebooks/${notebookId}/sources/${sourceId}/${filename}`
}

// Pfadschema für erzeugte Audio-Übersichten (WAV).
export function audioKey(notebookId: string, audioId: string) {
  return `notebooks/${notebookId}/audio/${audioId}.wav`
}

// Pfadschema für erzeugte Video-Übersichten (MP4).
export function videoKey(notebookId: string, videoId: string) {
  return `notebooks/${notebookId}/video/${videoId}.mp4`
}
