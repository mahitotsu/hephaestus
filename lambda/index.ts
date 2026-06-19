import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const BUCKET = process.env.REPORTS_BUCKET!;

interface FunctionUrlEvent {
  rawPath: string;
  queryStringParameters?: Record<string, string>;
}

function reportPage(key: string, mdContent: string): string {
  const safeContent = JSON.stringify(mdContent);
  const title = key.split('/').pop() ?? key;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Hephaestus</title>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           margin: 0; background: #f6f8fa; color: #24292f; line-height: 1.6; }
    #wrap { max-width: 960px; margin: 32px auto; padding: 0 24px 64px; }
    nav { margin-bottom: 16px; font-size: 0.875rem; }
    nav a { color: #0969da; text-decoration: none; }
    nav a:hover { text-decoration: underline; }
    article { background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
              padding: 32px 40px; }
    h1 { font-size: 1.75rem; border-bottom: 1px solid #d0d7de; padding-bottom: 8px; }
    h2 { font-size: 1.25rem; border-bottom: 1px solid #eaecef; padding-bottom: 4px; margin-top: 32px; }
    h3 { font-size: 1rem; margin-top: 24px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 0.875rem; }
    th, td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) td { background: #f6f8fa; }
    code { background: #eef0f3; border-radius: 4px; padding: 2px 6px;
           font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.85em; }
    pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
          padding: 16px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #d0d7de; margin: 0; padding: 0 16px; color: #57606a; }
    ul, ol { padding-left: 24px; }
    li { margin: 4px 0; }
    hr { border: none; border-top: 1px solid #d0d7de; margin: 24px 0; }
    a { color: #0969da; }
  </style>
</head>
<body>
  <div id="wrap">
    <nav><a href="/">← レポート一覧に戻る</a></nav>
    <article id="report"></article>
  </div>
  <script>
    const md = ${safeContent};
    document.getElementById('report').innerHTML = marked.parse(md);
  </script>
</body>
</html>`;
}

function indexPage(items: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hephaestus — デプロイメントレポート</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           margin: 0; background: #f6f8fa; color: #24292f; line-height: 1.6; }
    #wrap { max-width: 760px; margin: 48px auto; padding: 0 24px 64px; }
    h1 { font-size: 1.5rem; margin-bottom: 24px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
         margin-bottom: 8px; }
    li a { display: block; padding: 12px 16px; color: #0969da;
           text-decoration: none; font-family: "SFMono-Regular", Consolas, monospace;
           font-size: 0.875rem; }
    li a:hover { background: #f6f8fa; border-radius: 8px; }
    .empty { color: #57606a; font-style: italic; padding: 12px 0; }
  </style>
</head>
<body>
  <div id="wrap">
    <h1>Hephaestus — デプロイメントレポート</h1>
    <ul>${items}</ul>
  </div>
</body>
</html>`;
}

export const handler = async (event: FunctionUrlEvent) => {
  const key = event.queryStringParameters?.key;

  if (key) {
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const content = await Body!.transformToString();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: reportPage(key, content),
    };
  }

  const { Contents = [] } = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'reports/' }),
  );
  const sorted = [...Contents].sort(
    (a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
  );
  const items = sorted.length
    ? sorted.map(o => `<li><a href="?key=${encodeURIComponent(o.Key!)}">${o.Key}</a></li>`).join('\n')
    : '<li class="empty">レポートはまだありません。</li>';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: indexPage(items),
  };
};
