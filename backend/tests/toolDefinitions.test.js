import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TOOL_CATALOG, TOOL_IDS } from '../src/tools/toolDefinitions.js';

describe('Tool Definitions', () => {
  describe('Catalog Structure', () => {
    it('should have TOOL_CATALOG defined', () => {
      expect(TOOL_CATALOG).toBeDefined();
      expect(typeof TOOL_CATALOG).toBe('object');
    });

    it('should have TOOL_IDS defined', () => {
      expect(TOOL_IDS).toBeDefined();
      expect(Array.isArray(TOOL_IDS)).toBe(true);
    });

    it('should have tools in catalog', () => {
      expect(Object.keys(TOOL_CATALOG).length).toBeGreaterThan(0);
    });
  });

  describe('Tool Metadata', () => {
    it('should include web_search tool', () => {
      expect(TOOL_CATALOG.web_search).toBeDefined();
    });

    it('should include calculator tool', () => {
      expect(TOOL_CATALOG.calculator).toBeDefined();
    });

    it('should include code_runner tool', () => {
      expect(TOOL_CATALOG.code_runner).toBeDefined();
    });

    it('should include http_request tool', () => {
      expect(TOOL_CATALOG.http_request).toBeDefined();
    });
  });

  describe('Tool Properties', () => {
    const toolIds = Object.keys(TOOL_CATALOG);

    toolIds.forEach((toolId) => {
      describe(`Tool: ${toolId}`, () => {
        it('should have kind property (server or client)', () => {
          const tool = TOOL_CATALOG[toolId];
          expect(['server', 'client']).toContain(tool.kind);
        });

        it('should have label property', () => {
          const tool = TOOL_CATALOG[toolId];
          expect(tool.label).toBeDefined();
          expect(typeof tool.label).toBe('string');
          expect(tool.label.length).toBeGreaterThan(0);
        });

        it('should have anthropicTool property', () => {
          const tool = TOOL_CATALOG[toolId];
          expect(tool.anthropicTool).toBeDefined();
        });

        it('should have proper anthropicTool structure', () => {
          const tool = TOOL_CATALOG[toolId];
          expect(tool.anthropicTool.name).toBeDefined();
          expect(tool.anthropicTool.type || tool.anthropicTool.description).toBeDefined();
        });
      });
    });
  });

  describe('Client Tools', () => {
    const clientTools = Object.entries(TOOL_CATALOG)
      .filter(([_, tool]) => tool.kind === 'client')
      .map(([id, _]) => id);

    clientTools.forEach((toolId) => {
      it(`${toolId} should have execute function`, () => {
        const tool = TOOL_CATALOG[toolId];
        expect(typeof tool.execute).toBe('function');
      });
    });
  });

  describe('Tool IDs Array', () => {
    it('should contain all tools from catalog', () => {
      const catalogIds = Object.keys(TOOL_CATALOG);
      catalogIds.forEach((id) => {
        expect(TOOL_IDS).toContain(id);
      });
    });

    it('should not contain duplicate IDs', () => {
      const unique = new Set(TOOL_IDS);
      expect(unique.size).toBe(TOOL_IDS.length);
    });
  });

  describe('Web Search Tool', () => {
    it('should be marked as server kind', () => {
      expect(TOOL_CATALOG.web_search.kind).toBe('server');
    });

    it('should have correct type', () => {
      expect(TOOL_CATALOG.web_search.anthropicTool.type).toBe('web_search_20250305');
    });
  });

  describe('Calculator Tool', () => {
    it('should be marked as client kind', () => {
      expect(TOOL_CATALOG.calculator.kind).toBe('client');
    });

    it('should have input_schema', () => {
      const schema = TOOL_CATALOG.calculator.anthropicTool.input_schema;
      expect(schema).toBeDefined();
      expect(schema.properties.expression).toBeDefined();
    });
  });

  describe('Code Runner Tool', () => {
    it('should be marked as client kind', () => {
      expect(TOOL_CATALOG.code_runner.kind).toBe('client');
    });

    it('should have input_schema with code property', () => {
      const schema = TOOL_CATALOG.code_runner.anthropicTool.input_schema;
      expect(schema).toBeDefined();
      expect(schema.properties.code).toBeDefined();
    });
  });

  describe('HTTP Request Tool', () => {
    it('should be marked as client kind', () => {
      expect(TOOL_CATALOG.http_request.kind).toBe('client');
    });

    it('should have input_schema', () => {
      const schema = TOOL_CATALOG.http_request.anthropicTool.input_schema;
      expect(schema).toBeDefined();
    });
  });
});
