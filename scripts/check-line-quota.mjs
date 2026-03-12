import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LINE_API_BASE = 'https://api.line.me/v2/bot/message';

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return acc;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) acc[key] = value;
    return acc;
  }, {});
};

const loadToken = () => {
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return process.env.LINE_CHANNEL_ACCESS_TOKEN.trim();
  }

  const candidates = [
    path.resolve(process.cwd(), 'functions/.env'),
    path.resolve(process.cwd(), 'functions/.env.local'),
  ];

  for (const candidate of candidates) {
    const envValues = parseEnvFile(candidate);
    const token = envValues.LINE_CHANNEL_ACCESS_TOKEN?.trim();
    if (token) return token;
  }

  return '';
};

const requestLine = async (pathname, token) => {
  const response = await fetch(`${LINE_API_BASE}/${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const bodyText = await response.text();
  let body;

  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText };
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
};

const main = async () => {
  const token = loadToken();

  if (!token) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    console.error('Set it in the shell or add it to functions/.env');
    process.exitCode = 1;
    return;
  }

  const [quota, consumption] = await Promise.all([
    requestLine('quota', token),
    requestLine('quota/consumption', token),
  ]);

  if (!quota.ok || !consumption.ok) {
    console.error('LINE quota check failed');
    console.error(JSON.stringify({ quota, consumption }, null, 2));
    process.exitCode = 1;
    return;
  }

  const quotaValue = quota.body?.value ?? 'unknown';
  const quotaType = quota.body?.type ?? 'unknown';
  const usedValue = consumption.body?.totalUsage ?? 'unknown';
  const remainingValue =
    typeof quotaValue === 'number' && typeof usedValue === 'number'
      ? Math.max(quotaValue - usedValue, 0)
      : 'unknown';

  console.log('LINE monthly quota summary');
  console.log(`- type: ${quotaType}`);
  console.log(`- quota: ${quotaValue}`);
  console.log(`- used: ${usedValue}`);
  console.log(`- remaining: ${remainingValue}`);
  console.log('');
  console.log('quota response');
  console.log(JSON.stringify(quota.body, null, 2));
  console.log('');
  console.log('consumption response');
  console.log(JSON.stringify(consumption.body, null, 2));
};

main().catch((error) => {
  console.error('Unexpected error while checking LINE quota');
  console.error(error);
  process.exitCode = 1;
});
