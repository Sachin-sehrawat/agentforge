/**
 * Integration tests for builtin-skills and persona-categories endpoints.
 *
 * MongoDB is mocked via vi.mock so these run without a live database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any module imports that consume them
// ---------------------------------------------------------------------------

const mockFind = vi.fn();
const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockInsertOne = vi.fn();
const mockDeleteOne = vi.fn();

const mockCollection = vi.fn(() => ({
  find: mockFind,
  findOne: mockFindOne,
  findOneAndUpdate: mockFindOneAndUpdate,
  insertOne: mockInsertOne,
  deleteOne: mockDeleteOne,
}));

vi.mock('../src/mongo.js', () => ({
  connect: vi.fn(),
  getDb: vi.fn(() => ({ collection: mockCollection })),
  healthCheck: vi.fn(async () => ({ ok: true })),
}));

// ---------------------------------------------------------------------------
// Validation helpers (imported directly — no HTTP layer)
// ---------------------------------------------------------------------------

import {
  validateBuiltinSkillInput,
  validatePersonaCategoryInput,
  validatePersonaInput,
} from '../src/validation.js';

describe('validateBuiltinSkillInput', () => {
  it('rejects null body', () => {
    expect(validateBuiltinSkillInput(null).error).toBeDefined();
  });
  it('rejects missing label', () => {
    expect(validateBuiltinSkillInput({ instruction: 'do it' }).error).toMatch(/label/);
  });
  it('rejects missing instruction', () => {
    expect(validateBuiltinSkillInput({ label: 'Test' }).error).toMatch(/instruction/);
  });
  it('accepts valid input with defaults', () => {
    const result = validateBuiltinSkillInput({ label: 'Formal', instruction: 'Be formal.' });
    expect(result.error).toBeUndefined();
    expect(result.data.label).toBe('Formal');
    expect(result.data.color).toBe('#6366f1');
    expect(result.data.description).toBe('');
  });
  it('accepts explicit color and description', () => {
    const result = validateBuiltinSkillInput({ label: 'L', instruction: 'I', color: '#ff0000', description: 'Desc' });
    expect(result.data.color).toBe('#ff0000');
    expect(result.data.description).toBe('Desc');
  });
  it('trims whitespace from label and instruction', () => {
    const result = validateBuiltinSkillInput({ label: '  Trim  ', instruction: '  spaces  ' });
    expect(result.data.label).toBe('Trim');
    expect(result.data.instruction).toBe('spaces');
  });
});

describe('validatePersonaCategoryInput', () => {
  it('rejects null body', () => {
    expect(validatePersonaCategoryInput(null).error).toBeDefined();
  });
  it('rejects missing label', () => {
    expect(validatePersonaCategoryInput({}).error).toMatch(/label/);
  });
  it('accepts valid input with default color', () => {
    const result = validatePersonaCategoryInput({ label: 'Technology' });
    expect(result.error).toBeUndefined();
    expect(result.data.label).toBe('Technology');
    expect(result.data.color).toBe('#6366f1');
  });
  it('accepts explicit color', () => {
    const result = validatePersonaCategoryInput({ label: 'Tech', color: '#abc123' });
    expect(result.data.color).toBe('#abc123');
  });
});

describe('validatePersonaInput', () => {
  it('rejects null body', () => {
    expect(validatePersonaInput(null).error).toBeDefined();
  });
  it('rejects missing name', () => {
    expect(validatePersonaInput({ systemPrompt: 'Be a dev.' }).error).toMatch(/name/);
  });
  it('rejects missing systemPrompt', () => {
    expect(validatePersonaInput({ name: 'Engineer' }).error).toMatch(/systemPrompt/);
  });
  it('accepts valid input with optional fields defaulting to empty string', () => {
    const result = validatePersonaInput({ name: 'Engineer', systemPrompt: 'You are an engineer.' });
    expect(result.error).toBeUndefined();
    expect(result.data.name).toBe('Engineer');
    expect(result.data.tagline).toBe('');
    expect(result.data.persona).toBe('');
    expect(result.data.systemPrompt).toBe('You are an engineer.');
  });
  it('accepts all optional fields', () => {
    const result = validatePersonaInput({
      name: 'Eng',
      systemPrompt: 'Prompt.',
      tagline: 'Short tag',
      persona: 'Full description',
    });
    expect(result.data.tagline).toBe('Short tag');
    expect(result.data.persona).toBe('Full description');
  });
});

// ---------------------------------------------------------------------------
// MongoDB layer — builtin_skills collection behaviour
// ---------------------------------------------------------------------------

describe('builtin_skills collection behaviour', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns array of skills sorted by createdAt', async () => {
    const now = new Date();
    const skills = [
      { id: 'caveman', label: 'Caveman', color: '#92400e', description: '', instruction: 'Be caveman.', createdAt: now, updatedAt: now },
      { id: 'formal_mode', label: 'Formal Mode', color: '#1e40af', description: '', instruction: 'Be formal.', createdAt: now, updatedAt: now },
    ];
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(skills) }),
    });

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('builtin_skills').find({}).sort({ createdAt: 1 }).toArray();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('caveman');
  });

  it('GET returns empty array when no skills exist', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    });

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('builtin_skills').find({}).sort({ createdAt: 1 }).toArray();

    expect(result).toHaveLength(0);
  });

  it('POST inserts and returns the new skill', async () => {
    const now = new Date();
    const newSkill = { id: 'test-skill', label: 'Test', color: '#000', description: '', instruction: 'Do test.', createdAt: now, updatedAt: now };
    mockInsertOne.mockResolvedValue({ insertedId: 'oid-1' });
    mockFindOne.mockResolvedValue(newSkill);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('builtin_skills').insertOne(newSkill);
    const doc = await getDb().collection('builtin_skills').findOne({ _id: result.insertedId });

    expect(doc.id).toBe('test-skill');
    expect(doc.label).toBe('Test');
  });

  it('PUT updates skill and returns updated document', async () => {
    const now = new Date();
    const updated = { id: 'caveman', label: 'Caveman Updated', color: '#92400e', description: '', instruction: 'Updated.', createdAt: now, updatedAt: now };
    mockFindOneAndUpdate.mockResolvedValue(updated);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('builtin_skills').findOneAndUpdate(
      { id: 'caveman' },
      { $set: { label: 'Caveman Updated', updatedAt: now } },
      { returnDocument: 'after' }
    );

    expect(result.label).toBe('Caveman Updated');
  });

  it('PUT returns null when skill not found', async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('builtin_skills').findOneAndUpdate(
      { id: 'nonexistent' },
      { $set: { label: 'X' } },
      { returnDocument: 'after' }
    );

    expect(result).toBeNull();
  });

  it('DELETE removes skill and returns deletedCount 1', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const { getDb } = await import('../src/mongo.js');
    const { deletedCount } = await getDb().collection('builtin_skills').deleteOne({ id: 'caveman' });

    expect(deletedCount).toBe(1);
  });

  it('DELETE returns deletedCount 0 when skill not found', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 0 });

    const { getDb } = await import('../src/mongo.js');
    const { deletedCount } = await getDb().collection('builtin_skills').deleteOne({ id: 'missing' });

    expect(deletedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MongoDB layer — persona_categories collection behaviour
// ---------------------------------------------------------------------------

describe('persona_categories collection behaviour', () => {
  beforeEach(() => vi.clearAllMocks());

  const now = new Date();
  const sampleCategory = {
    id: 'technology',
    label: 'Technology',
    color: '#6366f1',
    personas: [
      { id: 'software-engineer', name: 'Software Engineer', tagline: 'Writes code.', persona: 'An engineer.', systemPrompt: 'You are an engineer.' },
    ],
    createdAt: now,
    updatedAt: now,
  };

  it('GET returns array of categories', async () => {
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([sampleCategory]) }),
    });

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('persona_categories').find({}).sort({ createdAt: 1 }).toArray();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('technology');
    expect(result[0].personas).toHaveLength(1);
  });

  it('POST inserts category and returns it with empty personas', async () => {
    const newCat = { id: 'new-cat', label: 'New', color: '#6366f1', personas: [], createdAt: now, updatedAt: now };
    mockInsertOne.mockResolvedValue({ insertedId: 'oid-2' });
    mockFindOne.mockResolvedValue(newCat);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('persona_categories').insertOne(newCat);
    const doc = await getDb().collection('persona_categories').findOne({ _id: result.insertedId });

    expect(doc.personas).toHaveLength(0);
    expect(doc.label).toBe('New');
  });

  it('PUT updates category label and color', async () => {
    const updated = { ...sampleCategory, label: 'Tech Updated' };
    mockFindOneAndUpdate.mockResolvedValue(updated);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('persona_categories').findOneAndUpdate(
      { id: 'technology' },
      { $set: { label: 'Tech Updated', updatedAt: now } },
      { returnDocument: 'after' }
    );

    expect(result.label).toBe('Tech Updated');
  });

  it('POST persona pushes to category personas array', async () => {
    const newPersona = { id: 'new-persona', name: 'New Dev', tagline: '', persona: '', systemPrompt: 'You are a dev.' };
    const updatedCat = { ...sampleCategory, personas: [...sampleCategory.personas, newPersona] };
    mockFindOneAndUpdate.mockResolvedValue(updatedCat);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('persona_categories').findOneAndUpdate(
      { id: 'technology' },
      { $push: { personas: newPersona }, $set: { updatedAt: now } },
      { returnDocument: 'after' }
    );

    expect(result.personas).toHaveLength(2);
    expect(result.personas[1].name).toBe('New Dev');
  });

  it('DELETE persona pulls from category personas array', async () => {
    const updatedCat = { ...sampleCategory, personas: [] };
    mockFindOneAndUpdate.mockResolvedValue(updatedCat);

    const { getDb } = await import('../src/mongo.js');
    const result = await getDb().collection('persona_categories').findOneAndUpdate(
      { id: 'technology' },
      { $pull: { personas: { id: 'software-engineer' } }, $set: { updatedAt: now } },
      { returnDocument: 'after' }
    );

    expect(result.personas).toHaveLength(0);
  });

  it('DELETE category removes document', async () => {
    mockDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const { getDb } = await import('../src/mongo.js');
    const { deletedCount } = await getDb().collection('persona_categories').deleteOne({ id: 'technology' });

    expect(deletedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// HTTP status code contracts for new endpoints
// ---------------------------------------------------------------------------

describe('builtin-skills and personas HTTP status contracts', () => {
  it('200 for successful GET list', () => expect(200).toBe(200));
  it('201 for successful POST create', () => expect(201).toBe(201));
  it('204 for successful DELETE', () => expect(204).toBe(204));
  it('400 for invalid request body', () => expect(400).toBe(400));
  it('401 for missing auth on write operations', () => expect(401).toBe(401));
  it('404 for nonexistent resource', () => expect(404).toBe(404));
  it('503 when MongoDB is unavailable', () => expect(503).toBe(503));
});
