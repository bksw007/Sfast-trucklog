#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const CONFIGSTORE_PATH =
  process.env.FIREBASE_CONFIGSTORE_PATH ||
  path.resolve(process.env.HOME || process.cwd(), '.config/configstore/firebase-tools.json');
const FIREBASE_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID ||
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET =
  process.env.FIREBASE_CLIENT_SECRET ||
  'j9iVZfS8kkCEFUPaAeJV0sAi';
const MANUAL_MAP_PATH =
  process.env.TODAY_JOBS_ASSIGNEE_MAP_PATH ||
  path.resolve(process.cwd(), 'scripts/backfill-assignee-map.json');
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  readProjectIdFromDotEnv() ||
  'sfast-trucklog-web';

const USERS_COLLECTION = 'users';
const TODAY_JOBS_COLLECTION = 'today_jobs';

function readProjectIdFromDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return '';

  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key === 'VITE_FIREBASE_PROJECT_ID') return rest.join('=').trim();
  }

  return '';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function readManualMap() {
  if (!fs.existsSync(MANUAL_MAP_PATH)) return {};

  try {
    const raw = fs.readFileSync(MANUAL_MAP_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [normalizeText(key), (value || '').toString().trim()])
    );
  } catch (error) {
    throw new Error(`Invalid JSON in ${MANUAL_MAP_PATH}`);
  }
}

async function readAccessToken() {
  const raw = fs.readFileSync(CONFIGSTORE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const refreshToken = parsed?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error(`No refresh token found in ${CONFIGSTORE_PATH}`);
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  const resp = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed generating OAuth token (${resp.status}): ${body}`);
  }

  const body = await resp.json();
  const token = body?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('OAuth response did not return access_token');
  }

  return token;
}

function parseFirestoreValue(value) {
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
}

function toPlainObject(doc) {
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
}

async function listCollectionDocs(accessToken, collection) {
  const docs = [];
  let pageToken = '';

  while (true) {
    const params = new URLSearchParams({ pageSize: '300' });
    if (pageToken) params.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?${params.toString()}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Failed listing ${collection} (${resp.status}): ${body}`);
    }

    const body = await resp.json();
    docs.push(...(body.documents || []));

    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }

  return docs;
}

function backupPayload(payload, label) {
  const backupDir = path.resolve(process.cwd(), 'backups');
  ensureDir(backupDir);
  const filePath = path.join(backupDir, `${label}_${timestamp()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

function addIndex(indexMap, key, user) {
  if (!key) return;
  const existing = indexMap.get(key) || [];
  existing.push(user);
  indexMap.set(key, existing);
}

function buildUserIndexes(userDocs) {
  const byDisplayName = new Map();
  const byEmailAlias = new Map();
  const byEmail = new Map();
  const byUid = new Map();

  for (const userDoc of userDocs) {
    const user = toPlainObject(userDoc);
    const data = user.data || {};
    const role = normalizeText(data.role || 'user');
    if (role !== 'user') continue;

    const uid = user.id;
    const displayName = normalizeText(data.displayName);
    const email = normalizeText(data.email);
    const emailAlias = normalizeText(email.split('@')[0] || '');

    const prepared = {
      uid,
      displayName: data.displayName || '',
      email: data.email || '',
    };

    byUid.set(uid, prepared);
    addIndex(byDisplayName, displayName, prepared);
    addIndex(byEmailAlias, emailAlias, prepared);
    addIndex(byEmail, email, prepared);
  }

  return { byUid, byDisplayName, byEmailAlias, byEmail };
}

function pickUnique(list) {
  if (!list || list.length !== 1) return null;
  return list[0];
}

function resolveUserByToken(token, indexes) {
  if (!token) return null;
  return (
    indexes.byUid.get(token) ||
    pickUnique(indexes.byEmail.get(token)) ||
    pickUnique(indexes.byDisplayName.get(token)) ||
    pickUnique(indexes.byEmailAlias.get(token)) ||
    null
  );
}

function inferAssignee(jobData, indexes, manualMap) {
  if (jobData.assignedToUid) {
    const existing = indexes.byUid.get(jobData.assignedToUid);
    return {
      matchType: 'existing',
      matchedUser: existing || null,
    };
  }

  const driverName = normalizeText(jobData.driverName);
  if (!driverName) {
    return { matchType: 'missing-driver-name', matchedUser: null };
  }

  const manualToken = manualMap[driverName];
  const manualUser = resolveUserByToken(manualToken, indexes);
  if (manualUser) {
    return { matchType: 'manual-map', matchedUser: manualUser };
  }

  const byDisplay = pickUnique(indexes.byDisplayName.get(driverName));
  if (byDisplay) return { matchType: 'displayName', matchedUser: byDisplay };

  const byAlias = pickUnique(indexes.byEmailAlias.get(driverName));
  if (byAlias) return { matchType: 'email-alias', matchedUser: byAlias };

  const byEmail = pickUnique(indexes.byEmail.get(driverName));
  if (byEmail) return { matchType: 'email', matchedUser: byEmail };

  return { matchType: 'no-match', matchedUser: null };
}

function buildPatch(doc, matchedUser) {
  const data = toPlainObject(doc).data || {};
  const updates = {};

  if (!data.assignedToUid && matchedUser?.uid) {
    updates.assignedToUid = { stringValue: matchedUser.uid };
  }

  if (!data.assignedToName && matchedUser?.displayName) {
    updates.assignedToName = { stringValue: matchedUser.displayName };
  }

  if (Object.keys(updates).length === 0) return null;

  const params = new URLSearchParams();
  Object.keys(updates).forEach((fieldPath) => params.append('updateMask.fieldPaths', fieldPath));

  return {
    url: `https://firestore.googleapis.com/v1/${doc.name}?${params.toString()}`,
    body: { fields: updates },
  };
}

async function applyPatch(accessToken, patch) {
  const resp = await fetch(patch.url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch.body),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Patch failed (${resp.status}): ${body}`);
  }
}

async function main() {
  const accessToken = await readAccessToken();
  const manualMap = readManualMap();
  const [userDocs, jobDocs] = await Promise.all([
    listCollectionDocs(accessToken, USERS_COLLECTION),
    listCollectionDocs(accessToken, TODAY_JOBS_COLLECTION),
  ]);

  const indexes = buildUserIndexes(userDocs);
  const plan = [];
  let alreadyAssigned = 0;
  let inferred = 0;
  let noMatch = 0;

  for (const jobDoc of jobDocs) {
    const plainJob = toPlainObject(jobDoc);
    const { matchedUser, matchType } = inferAssignee(plainJob.data || {}, indexes, manualMap);
    const patch = buildPatch(jobDoc, matchedUser);

    if ((plainJob.data || {}).assignedToUid) alreadyAssigned += 1;
    if (matchType === 'displayName' || matchType === 'email-alias' || matchType === 'email' || matchType === 'manual-map') inferred += 1;
    if (!matchedUser && !(plainJob.data || {}).assignedToUid) noMatch += 1;

    if (patch) {
      plan.push({
        id: plainJob.id,
        jobNo: plainJob.data?.jobNo || '',
        driverName: plainJob.data?.driverName || '',
        matchedUid: matchedUser?.uid || '',
        matchedName: matchedUser?.displayName || '',
        matchType,
        patch,
      });
    }
  }

  const backupPath = backupPayload(
    {
      projectId: PROJECT_ID,
      collection: TODAY_JOBS_COLLECTION,
      exportedAt: new Date().toISOString(),
      jobs: jobDocs.map(toPlainObject),
      users: userDocs.map(toPlainObject),
    },
    'today_jobs_assignee_backup'
  );

  if (APPLY) {
    for (const row of plan) {
      await applyPatch(accessToken, row.patch);
    }
  }

  const unresolvedDriverNames = Array.from(
    new Set(
      jobDocs
        .map(toPlainObject)
        .map((doc) => doc.data || {})
        .filter((data) => !data.assignedToUid)
        .map((data) => data.driverName || '')
        .map((name) => normalizeText(name))
        .filter(Boolean)
        .filter((name) => !manualMap[name])
    )
  ).sort((a, b) => a.localeCompare(b, 'th'));

  const report = {
    projectId: PROJECT_ID,
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    manualMapPath: MANUAL_MAP_PATH,
    manualMapEntries: Object.keys(manualMap).length,
    backupPath,
    totalJobs: jobDocs.length,
    totalUsers: userDocs.length,
    alreadyAssigned,
    inferred,
    noMatch,
    patchable: plan.length,
    patched: APPLY ? plan.length : 0,
    unresolvedDriverNames,
    users: Array.from(indexes.byUid.values()).map((user) => ({
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
    })),
    sample: plan.slice(0, 15).map((row) => ({
      id: row.id,
      jobNo: row.jobNo,
      driverName: row.driverName,
      matchedUid: row.matchedUid,
      matchedName: row.matchedName,
      matchType: row.matchType,
    })),
    executedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
