import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'sfast-trucklog-web';
const DATABASE = '(default)';
const PAGE_SIZE = 200;

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

const readFirebaseToolsConfig = () => {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
};

const getAccessToken = () => {
  const config = readFirebaseToolsConfig();
  const accessToken = config?.tokens?.access_token;
  const expiresAt = Number(config?.tokens?.expires_at || 0);

  if (!accessToken) {
    throw new Error('firebase-tools access token not found. Run `firebase login` first.');
  }

  if (expiresAt && expiresAt <= Date.now()) {
    throw new Error('firebase-tools access token has expired. Run `firebase login --reauth` first.');
  }

  return accessToken;
};

const accessToken = getAccessToken();
const apply = process.argv.includes('--apply');

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
};

const decodeValue = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('mapValue' in value) {
    return decodeFields(value.mapValue.fields || {});
  }
  if ('arrayValue' in value) {
    return Array.isArray(value.arrayValue.values)
      ? value.arrayValue.values.map((entry) => decodeValue(entry))
      : [];
  }
  return undefined;
};

const decodeFields = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));

const listDocuments = async (collectionId) => {
  const docs = [];
  let pageToken = '';

  while (true) {
    const query = new URLSearchParams({
      pageSize: String(PAGE_SIZE),
    });
    if (pageToken) query.set('pageToken', pageToken);

    const url = `${firestoreBaseUrl}/${collectionId}?${query.toString()}`;
    const data = await requestJson(url);
    docs.push(...(data.documents || []));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return docs;
};

const patchDriverPhone = async (documentName, driverPhone) => {
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  url.searchParams.append('updateMask.fieldPaths', 'driverPhone');

  await requestJson(url.toString(), {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        driverPhone: {
          stringValue: driverPhone,
        },
      },
    }),
  });
};

const main = async () => {
  const todayJobDocs = await listDocuments('today_jobs');
  let scanned = 0;
  let missingPhone = 0;
  let changed = 0;
  let skipped = 0;

  for (const doc of todayJobDocs) {
    scanned += 1;
    const docId = doc.name.split('/').pop() || '';
    const data = decodeFields(doc.fields);
    const driverPhone = typeof data.driverPhone === 'string' ? data.driverPhone.trim() : '';

    if (!driverPhone) {
      missingPhone += 1;
      continue;
    }

    const targetName = `projects/${PROJECT_ID}/databases/${DATABASE}/documents/jobs/today_${docId}`;

    try {
      const existing = await requestJson(`https://firestore.googleapis.com/v1/${targetName}`);
      const existingFields = decodeFields(existing.fields);
      const currentPhone = typeof existingFields.driverPhone === 'string' ? existingFields.driverPhone.trim() : '';

      if (currentPhone === driverPhone) {
        skipped += 1;
        continue;
      }

      if (apply) {
        await patchDriverPhone(targetName, driverPhone);
      }
      changed += 1;
      console.log(`${apply ? 'updated' : 'would-update'} jobs/today_${docId} -> ${driverPhone}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('"code":404') || message.includes('"status":"NOT_FOUND"')) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        projectId: PROJECT_ID,
        apply,
        scanned,
        changed,
        skipped,
        missingPhone,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
