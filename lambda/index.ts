import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.REPORTS_BUCKET!;

interface FunctionUrlEvent {
  rawPath: string;
  queryStringParameters?: Record<string, string>;
}

export const handler = async (event: FunctionUrlEvent) => {
  const key = event.queryStringParameters?.key;

  if (key) {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const content = await Body!.transformToString();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content,
    };
  }

  const { Contents = [] } = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'reports/' }),
  );
  const sorted = [...Contents].sort(
    (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
  );
  const items = sorted
    .map(o => `<li><a href="?key=${encodeURIComponent(o.Key!)}">${o.Key}</a></li>`)
    .join('\n');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
<html><head><title>Hephaestus Reports</title></head>
<body>
<h1>Deployment Reports</h1>
<ul>${items || '<li>No reports yet.</li>'}</ul>
</body></html>`,
  };
};
