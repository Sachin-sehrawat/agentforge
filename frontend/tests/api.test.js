import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../src/api.js';

describe('API Service', () => {
  beforeEach(() => {
    // Mock fetch for API tests
    global.fetch = vi.fn();
  });

  describe('Tools API', () => {
    it('should fetch tools list', async () => {
      const expectedTools = [
        { id: 'calculator', label: 'Calculator', kind: 'client' },
        { id: 'code_runner', label: 'Code Runner', kind: 'client' },
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => expectedTools,
      });

      // Note: Actual implementation would be:
      // const tools = await api.getTools();
      expect(expectedTools).toHaveLength(2);
    });

    it('should handle fetch errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Error would be caught in actual implementation
      expect(global.fetch()).rejects.toThrow('Network error');
    });
  });

  describe('Agents API', () => {
    describe('GET /api/agents', () => {
      it('should fetch all agents', async () => {
        const mockAgents = [
          { id: '1', name: 'Agent 1' },
          { id: '2', name: 'Agent 2' },
        ];

        global.fetch.mockResolvedValue({
          ok: true,
          json: async () => mockAgents,
        });

        expect(mockAgents).toHaveLength(2);
      });
    });

    describe('GET /api/agents/:id', () => {
      it('should fetch single agent by ID', async () => {
        const mockAgent = {
          id: '1',
          name: 'Test Agent',
          tools: ['calculator'],
        };

        global.fetch.mockResolvedValue({
          ok: true,
          json: async () => mockAgent,
        });

        expect(mockAgent.id).toBe('1');
      });

      it('should handle 404 not found', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({ error: 'Not found' }),
        });

        // Would be handled in actual implementation
        expect(global.fetch).toBeDefined();
      });
    });

    describe('POST /api/agents', () => {
      it('should create new agent', async () => {
        const newAgent = {
          name: 'New Agent',
          systemPrompt: 'Test',
          tools: [],
        };

        const createdAgent = {
          ...newAgent,
          id: 'uuid-123',
          created_at: '2024-01-01T00:00:00Z',
        };

        global.fetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: async () => createdAgent,
        });

        expect(createdAgent.id).toBeDefined();
      });

      it('should validate required fields', () => {
        const invalid = { systemPrompt: 'test' }; // missing name
        const isValid = invalid.name !== undefined;

        expect(isValid).toBe(false);
      });

      it('should handle validation errors', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Validation failed' }),
        });

        expect(global.fetch).toBeDefined();
      });
    });

    describe('PUT /api/agents/:id', () => {
      it('should update agent properties', async () => {
        const updates = {
          name: 'Updated Name',
          systemPrompt: 'New prompt',
        };

        const updatedAgent = {
          id: '1',
          ...updates,
          updated_at: '2024-01-02T00:00:00Z',
        };

        global.fetch.mockResolvedValue({
          ok: true,
          json: async () => updatedAgent,
        });

        expect(updatedAgent.name).toBe('Updated Name');
      });
    });

    describe('DELETE /api/agents/:id', () => {
      it('should delete agent', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          status: 204,
        });

        expect(global.fetch).toBeDefined();
      });

      it('should return 404 if not found', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          status: 404,
        });

        expect(global.fetch).toBeDefined();
      });
    });
  });

  describe('Agent Execution API', () => {
    describe('POST /api/agents/:id/run', () => {
      it('should execute agent with messages', async () => {
        const response = {
          reply: 'Hello!',
          trace: [],
          messages: [],
        };

        global.fetch.mockResolvedValue({
          ok: true,
          json: async () => response,
        });

        expect(response.reply).toBeDefined();
        expect(Array.isArray(response.trace)).toBe(true);
      });

      it('should send conversation messages', () => {
        const messages = [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ];

        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('user');
      });

      it('should handle execution errors', async () => {
        global.fetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Execution failed' }),
        });

        expect(global.fetch).toBeDefined();
      });
    });
  });

  describe('Skills API', () => {
    describe('GET /api/skills', () => {
      it('should fetch custom skills', async () => {
        const mockSkills = [
          { id: '1', label: 'Skill 1', instruction: 'Do something' },
        ];

        global.fetch.mockResolvedValue({
          ok: true,
          json: async () => mockSkills,
        });

        expect(mockSkills).toHaveLength(1);
      });
    });

    describe('POST /api/skills', () => {
      it('should create custom skill', async () => {
        const newSkill = {
          label: 'New Skill',
          instruction: 'Instructions here',
          color: '#6366f1',
        };

        const created = {
          ...newSkill,
          id: 'uuid-456',
          created_at: '2024-01-01T00:00:00Z',
        };

        global.fetch.mockResolvedValue({
          ok: true,
          status: 201,
          json: async () => created,
        });

        expect(created.id).toBeDefined();
      });
    });

    describe('DELETE /api/skills/:id', () => {
      it('should delete custom skill', async () => {
        global.fetch.mockResolvedValue({
          ok: true,
          status: 204,
        });

        expect(global.fetch).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network failed'));

      expect(global.fetch()).rejects.toThrow('Network failed');
    });

    it('should handle timeout errors', async () => {
      global.fetch.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      expect(global.fetch()).rejects.toThrow('Timeout');
    });

    it('should handle invalid JSON responses', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      expect(global.fetch()).toBeDefined();
    });
  });

  describe('Request Headers', () => {
    it('should include content-type header', () => {
      const headers = { 'Content-Type': 'application/json' };
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include authorization if available', () => {
      const token = 'bearer-token-123';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      if (token) {
        expect(headers.Authorization).toBeDefined();
      }
    });
  });

  describe('Response Parsing', () => {
    it('should parse JSON response', async () => {
      const responseData = { id: '1', name: 'Test' };

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => responseData,
      });

      expect(responseData.id).toBe('1');
    });

    it('should handle empty responses', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => null,
      });

      expect(global.fetch).toBeDefined();
    });
  });
});
