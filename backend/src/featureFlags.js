import { getDb } from './mongo.js';

const COLLECTION = 'feature_flags';
const SINGLETON_ID = 'global';

export const VALID_MODES = ['pro', 'easy'];
export const DEFAULT_MODE = 'pro';

export const DEFAULT_FLAGS = {
  // Pages / navigation
  'page.builder':     true,
  'page.agents':      true,
  'page.marketplace': true,
  'page.skills':      true,
  'page.developer':   true,
  'page.settings':    true,

  // Builder panel features
  'builder.tools':          true,
  'builder.skills':         true,
  'builder.personas':       true,
  'builder.templates':      true,
  'builder.import':         true,
  'builder.versionHistory': true,
  'builder.export':         true,

  // Agents page actions
  'agents.subscribe':    true,
  'agents.fork':         true,
  'agents.duplicate':    true,
  'agents.visibility':   true,
  'agents.analytics':    true,
  'agents.exportFormat': true,
  'agents.bulkDelete':   true,
  'agents.bulkExport':   true,
  'agents.favorites':    true,

  // Marketplace
  'marketplace.fork':    true,
  'marketplace.ratings': true,

  // Skills page
  'skills.create': true,
  'skills.edit':   true,
  'skills.delete': true,

  // GitHub integration
  'github.connect': true,

  // Webhooks / developer
  'webhooks.create':       true,
  'webhooks.testDelivery': true,

  // Auth
  'auth.register': true,
};

// Flags forced to false in Easy Mode regardless of stored values.
export const EASY_MODE_OVERRIDES = {
  'page.developer':          false,
  'page.settings':           false,
  'page.skills':             false,
  'builder.skills':          false,
  'builder.personas':        false,
  'builder.import':          false,
  'builder.versionHistory':  false,
  'agents.subscribe':        false,
  'agents.fork':             false,
  'agents.duplicate':        false,
  'agents.visibility':       false,
  'agents.analytics':        false,
  'agents.exportFormat':     false,
  'agents.bulkDelete':       false,
  'agents.bulkExport':       false,
  'agents.favorites':        false,
  'marketplace.fork':        false,
  'marketplace.ratings':     false,
  'skills.create':           false,
  'skills.edit':             false,
  'skills.delete':           false,
  'github.connect':          false,
  'webhooks.create':         false,
  'webhooks.testDelivery':   false,
};

export async function getFlags() {
  const db = getDb();
  const doc = await db.collection(COLLECTION).findOne({ _id: SINGLETON_ID });
  if (!doc) return { flags: { ...DEFAULT_FLAGS }, uiMode: DEFAULT_MODE };
  const { _id, updatedAt, uiMode, ...stored } = doc;
  const flags = { ...DEFAULT_FLAGS, ...stored };
  return { flags, uiMode: VALID_MODES.includes(uiMode) ? uiMode : DEFAULT_MODE };
}

export async function setFlags(patch) {
  const db = getDb();
  const allowed = new Set(Object.keys(DEFAULT_FLAGS));
  const update = {};

  if (patch.uiMode !== undefined) {
    if (VALID_MODES.includes(patch.uiMode)) update.uiMode = patch.uiMode;
  }

  for (const [k, v] of Object.entries(patch)) {
    if (k === 'uiMode') continue;
    if (allowed.has(k) && typeof v === 'boolean') update[k] = v;
  }

  if (Object.keys(update).length === 0) return getFlags();

  await db.collection(COLLECTION).updateOne(
    { _id: SINGLETON_ID },
    { $set: { ...update, updatedAt: new Date() } },
    { upsert: true }
  );
  return getFlags();
}
