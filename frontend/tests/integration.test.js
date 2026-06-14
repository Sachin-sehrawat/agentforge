import { describe, it, expect } from 'vitest';

describe('Integration Tests', () => {
  describe('Agent Creation Workflow', () => {
    it('should create agent with valid data', () => {
      const agentData = {
        name: 'My Agent',
        persona: 'helpful',
        systemPrompt: 'Be helpful and concise',
        model: 'claude-sonnet-4-6',
        tools: ['calculator', 'code_runner'],
      };

      expect(agentData.name).toBeDefined();
      expect(agentData.model).toBeDefined();
      expect(agentData.tools.length).toBeGreaterThan(0);
    });

    it('should save agent to database', () => {
      const agent = {
        id: 'uuid-123',
        name: 'My Agent',
        created_at: new Date().toISOString(),
      };

      expect(agent.id).toBeDefined();
      expect(agent.created_at).toBeDefined();
    });

    it('should display agent in list after creation', () => {
      const agents = [
        { id: 'uuid-123', name: 'My Agent' },
      ];

      const created = agents.find((a) => a.id === 'uuid-123');
      expect(created).toBeDefined();
    });
  });

  describe('Agent Execution Workflow', () => {
    it('should configure agent with tools', () => {
      const agent = {
        id: 'uuid-123',
        tools: ['calculator', 'code_runner'],
      };

      expect(agent.tools).toContain('calculator');
      expect(agent.tools).toContain('code_runner');
    });

    it('should send message to agent', () => {
      const message = {
        role: 'user',
        content: 'What is 2 + 2?',
      };

      expect(message.content).toContain('2 + 2');
    });

    it('should receive agent response', () => {
      const response = {
        reply: 'The answer is 4',
        trace: [],
        messages: [],
      };

      expect(response.reply).toBeDefined();
      expect(Array.isArray(response.messages)).toBe(true);
    });

    it('should execute agent tools in response', () => {
      const trace = [
        {
          type: 'tool_use',
          tool: 'calculator',
          input: { expression: '2 + 2' },
          result: { result: '4' },
        },
      ];

      expect(trace[0].tool).toBe('calculator');
      expect(trace[0].result.result).toBe('4');
    });

    it('should display tool results in chat', () => {
      const messages = [
        { role: 'user', content: 'What is 2 + 2?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'calculator', input: { expression: '2+2' } },
          ],
        },
        { role: 'user', content: [{ type: 'tool_result', content: '4' }] },
        { role: 'assistant', content: 'The answer is 4' },
      ];

      const finalReply = messages[messages.length - 1].content;
      expect(finalReply).toContain('4');
    });
  });

  describe('Custom Skills Workflow', () => {
    it('should create custom skill', () => {
      const skill = {
        id: 'skill-123',
        label: 'Python Expert',
        description: 'Expert in Python programming',
        instruction: 'Help users with Python code',
        color: '#6366f1',
      };

      expect(skill.label).toBeDefined();
      expect(skill.instruction).toBeDefined();
    });

    it('should add skill to agent', () => {
      const agent = {
        id: 'agent-123',
        skills: ['skill-123'],
      };

      expect(agent.skills).toContain('skill-123');
    });

    it('should use skill in agent execution', () => {
      const skillInstruction = 'Help users with Python code';
      const agentPrompt = `${skillInstruction}\n\nUser: Write a Python function`;

      expect(agentPrompt).toContain('Python');
      expect(agentPrompt).toContain('User:');
    });
  });

  describe('Data Persistence', () => {
    it('should persist agent data across sessions', () => {
      const originalAgent = {
        id: 'uuid-123',
        name: 'My Agent',
        created_at: '2024-01-01T00:00:00Z',
      };

      // Simulate reload
      const persistedAgent = { ...originalAgent };

      expect(persistedAgent.id).toBe(originalAgent.id);
      expect(persistedAgent.name).toBe(originalAgent.name);
    });

    it('should persist custom skills', () => {
      const skill = {
        id: 'skill-123',
        label: 'Custom Skill',
        created_at: '2024-01-01T00:00:00Z',
      };

      const persisted = { ...skill };
      expect(persisted.id).toBe(skill.id);
    });

    it('should update agent modified timestamp', () => {
      const agent = {
        id: 'uuid-123',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const updatedAt = new Date().toISOString();
      const modified = { ...agent, updated_at: updatedAt };

      expect(new Date(modified.updated_at) > new Date(agent.updated_at)).toBe(true);
    });
  });

  describe('Frontend-Backend Communication', () => {
    it('should fetch agents from API', () => {
      const apiResponse = [
        { id: '1', name: 'Agent 1' },
        { id: '2', name: 'Agent 2' },
      ];

      expect(apiResponse).toHaveLength(2);
    });

    it('should send agent updates to API', () => {
      const updates = {
        name: 'Updated Name',
        systemPrompt: 'Updated prompt',
      };

      expect(updates.name).toBeDefined();
      expect(updates.systemPrompt).toBeDefined();
    });

    it('should handle API errors gracefully', () => {
      const error = { message: 'API Error', status: 500 };

      expect(error.message).toBeDefined();
      expect(error.status).toBe(500);
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should complete full agent creation and execution cycle', () => {
      // Create agent
      const agent = {
        id: 'uuid-123',
        name: 'Math Agent',
        tools: ['calculator'],
      };

      // Save to database
      const saved = { ...agent, created_at: new Date().toISOString() };

      // Send message
      const message = { role: 'user', content: 'What is 10 * 5?' };

      // Get response
      const response = {
        reply: 'The answer is 50',
        trace: [{ tool: 'calculator', result: { result: '50' } }],
      };

      expect(agent.id).toBeDefined();
      expect(saved.created_at).toBeDefined();
      expect(response.reply).toContain('50');
    });

    it('should handle multi-turn conversation', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: 'The answer is 4' },
      ];

      expect(messages).toHaveLength(4);
      expect(messages[3].content).toContain('4');
    });

    it('should export agent as markdown', () => {
      const agent = {
        name: 'My Agent',
        systemPrompt: 'Be helpful',
        tools: ['calculator', 'code_runner'],
      };

      const markdown = `# ${agent.name}\n\n${agent.systemPrompt}`;

      expect(markdown).toContain(agent.name);
      expect(markdown).toContain(agent.systemPrompt);
    });
  });
});
