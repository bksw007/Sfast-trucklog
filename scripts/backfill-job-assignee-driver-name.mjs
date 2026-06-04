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
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  readProjectIdFromDotEnv() ||
  'sfast-trucklog-web';
const DATABASE = '(default)';
const PAGE_SIZE = 200;

const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed generating OAuth token (${resp.status}): ${body}`);
  }

  const body = await resp.json();
  if (!body?.access_token || typeof body.access_token !== 'string') {
    throw new Error('OAuth response did not return access_token');
  }
  return body.access_token;
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(parseFirestoreValue);
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, parseFirestoreValue(item)]));
  }
  return null;
}

function parseFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)]));
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])),
      },
    };
  }
  return { stringValue: String(value) };
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`Request failed (${response.status}): ${JSON.stringify(data)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function listDocuments(collectionId, token) {
  const docs = [];
  let pageToken = '';

  while (true) {
    const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) query.set('pageToken', pageToken);

    const data = await requestJson(`${firestoreBaseUrl}/${collectionId}?${query.toString()}`, token);
    docs.push(...(data.documents || []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return docs;
}

function resolveDriverName(user) {
  return [user.fullName, user.displayName, user.nickname]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean) || '';
}

async function patchDocument(documentName, fields, token) {
  const url = new URL(`https://firestore.googleapis.com/v1/${documentName}`);
  Object.keys(fields).forEach((field) => url.searchParams.append('updateMask.fieldPaths', field));

  await requestJson(url.toString(), token, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])),
    }),
  });
}

async function main() {
  const token = await readAccessToken();
  const [userDocs, todayJobDocs] = await Promise.all([
    listDocuments('users', token),
    listDocuments('today_jobs', token),
  ]);
  const usersByUid = new Map(userDocs.map((doc) => [doc.name.split('/').pop(), parseFields(doc.fields)]));

  let scanned = 0;
  let missingAssignee = 0;
  let missingUser = 0;
  let changedTodayJobs = 0;
  let changedJobs = 0;
  let missingSyncedJob = 0;

  for (const todayDoc of todayJobDocs) {
    scanned += 1;
    const todayJobId = todayDoc.name.split('/').pop() || '';
    const todayJob = parseFields(todayDoc.fields);
    const assignedToUid = typeof todayJob.assignedToUid === 'string' ? todayJob.assignedToUid.trim() : '';
    if (!assignedToUid) {
      missingAssignee += 1;
      continue;
    }

    const assignedName = resolveDriverName(usersByUid.get(assignedToUid) || {});
    if (!assignedName) {
      missingUser += 1;
      continue;
    }

    const todayPatch = {};
    if ((todayJob.driverName || '').trim() !== assignedName) todayPatch.driverName = assignedName;
    if ((todayJob.assignedToName || '').trim() !== assignedName) todayPatch.assignedToName = assignedName;

    if (Object.keys(todayPatch).length > 0) {
      changedTodayJobs += 1;
      console.log(`${APPLY ? 'update' : 'would-update'} today_jobs/${todayJobId} -> ${assignedName}`);
      if (APPLY) await patchDocument(todayDoc.name, todayPatch, token);
    }

    const syncedJobName = `projects/${PROJECT_ID}/databases/${DATABASE}/documents/jobs/today_${todayJobId}`;
    try {
      const syncedDoc = await requestJson(`https://firestore.googleapis.com/v1/${syncedJobName}`, token);
      const syncedJob = parseFields(syncedDoc.fields);
      const syncedPatch = {};
      if ((syncedJob.driverName || '').trim() !== assignedName) syncedPatch.driverName = assignedName;
      if ((syncedJob.assignedToName || '').trim() !== assignedName) syncedPatch.assignedToName = assignedName;
      if ((syncedJob.assignedToUid || '').trim() !== assignedToUid) syncedPatch.assignedToUid = assignedToUid;

      if (Object.keys(syncedPatch).length > 0) {
        changedJobs += 1;
        console.log(`${APPLY ? 'update' : 'would-update'} jobs/today_${todayJobId} -> ${assignedName}`);
        if (APPLY) await patchDocument(syncedJobName, syncedPatch, token);
      }
    } catch (error) {
      if (error?.status === 404) {
        missingSyncedJob += 1;
        continue;
      }
      throw error;
    }
  }

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    apply: APPLY,
    scanned,
    changedTodayJobs,
    changedJobs,
    missingAssignee,
    missingUser,
    missingSyncedJob,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
