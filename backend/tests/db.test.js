import { describe, it, expect, beforeEach, vi } from 'vitest';
import db from '../src/db.js';

describe('Database Module', () => {
  describe('Initialization', () => {
    it('should initialize database connection', () => {
      expect(db).toBeDefined();
    });

    it('should have database methods', () => {
      expect(typeof db.prepare).toBe('function');
    });
  });

  describe('Tables', () => {
    it('should have agents table', () => {
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'").get();
      expect(result).toBeDefined();
      expect(result.name).toBe('agents');
    });

    it('should have custom_skills table', () => {
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_skills'").get();
      expect(result).toBeDefined();
      expect(result.name).toBe('custom_skills');
    });
  });

  describe('Agents Table Schema', () => {
    it('should have required columns in agents table', () => {
      const columns = db.prepare("PRAGMA table_info(agents)").all();
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('persona');
      expect(columnNames).toContain('system_prompt');
      expect(columnNames).toContain('model');
      expect(columnNames).toContain('tools');
      expect(columnNames).toContain('positions');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('should have skills and instructions columns', () => {
      const columns = db.prepare("PRAGMA table_info(agents)").all();
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('skills');
      expect(columnNames).toContain('instructions');
    });
  });

  describe('Custom Skills Table Schema', () => {
    it('should have required columns in custom_skills table', () => {
      const columns = db.prepare("PRAGMA table_info(custom_skills)").all();
      const columnNames = columns.map(c => c.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('label');
      expect(columnNames).toContain('color');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('instruction');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });
  });
});
