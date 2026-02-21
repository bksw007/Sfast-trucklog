#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'sfast-trucklog-web';
const COLLECTION = process.env.FIRESTORE_COLLECTION || 'jobs';
const APPLY = process.argv.includes('--apply');
const CONFIGSTORE_PATH =
  process.env.FIREBASE_CONFIGSTORE_PATH ||
  path.resolve(process.cwd(), '.config/configstore/firebase-tools.json');

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const timestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const readAccessToken = () => {
  const raw = fs.readFileSync(CONFIGSTORE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const token = parsed?.tokens?.access_token;
  if (!token) {
    throw new Error(`No access token found in ${CONFIGSTORE_PATH}`);
  }
  return token;
};

const parseFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;

  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('arrayValue' in value) {
    const values = value.arrayValue?.values || [];
    return values.map(parseFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, parseFirestoreValue(v)])
    );
  }

  return null;
};

const toPlainObject = (doc) => {
  const fields = doc.fields || {};
  const plain = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, parseFirestoreValue(v)])
  );
  return {
    id: doc.name.split('/').pop(),
    name: doc.name,
    createTime: doc.createTime,
    updateTime: doc.updateTime,
    data: plain,
    rawFields: fields,
  };
};

const listCollectionDocs = async (accessToken) => {
  const docs = [];
  let pageToken = '';

  while (true) {
    const params = new URLSearchParams({ pageSize: '300' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?${params.toString()}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed listing documents (${resp.status}): ${body}`);
    }

    const body = await resp.json();
    docs.push(...(body.documents || []));

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return docs;
};

const backupDocs = (docs) => {
  const backupDir = path.resolve(process.cwd(), 'backups');
  ensureDir(backupDir);

  const stamp = timestamp();
  const backupPath = path.join(backupDir, `jobs_backup_${stamp}.json`);
  const plain = docs.map(toPlainObject);

  const payload = {
    projectId: PROJECT_ID,
    collection: COLLECTION,
    exportedAt: new Date().toISOString(),
    count: plain.length,
    documents: plain,
  };

  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), 'utf8');
  return backupPath;
};

const migrateJointPrice = async (docs, accessToken) => {
  const targets = docs.filter((doc) => {
    const fields = doc.fields || {};
    return fields.driverPrice !== undefined && fields.jointPrice === undefined;
  });

  const sampleIds = targets.slice(0, 10).map((d) => d.name.split('/').pop());

  if (!APPLY) {
    return {
      dryRun: true,
      targetCount: targets.length,
      updatedCount: 0,
      sampleIds,
    };
  }

  let updatedCount = 0;
  for (const doc of targets) {
    const driverPriceField = doc.fields.driverPrice;
    const patchUrl = `https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=jointPrice`;
    const resp = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          jointPrice: driverPriceField,
        },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed updating ${doc.name} (${resp.status}): ${body}`);
    }
    updatedCount += 1;
  }

  return {
    dryRun: false,
    targetCount: targets.length,
    updatedCount,
    sampleIds,
  };
};

const main = async () => {
  const accessToken = readAccessToken();
  const docs = await listCollectionDocs(accessToken);
  const backupPath = backupDocs(docs);
  const migrationResult = await migrateJointPrice(docs, accessToken);

  const report = {
    projectId: PROJECT_ID,
    collection: COLLECTION,
    applyMode: APPLY ? 'APPLY' : 'DRY_RUN',
    fetchedDocuments: docs.length,
    backupPath,
    migration: migrationResult,
    executedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
