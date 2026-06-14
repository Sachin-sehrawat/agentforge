import { describe, it, expect, beforeEach } from 'vitest';
import { runCode } from '../src/tools/codeRunner.js';

describe('Code Runner Tool', () => {
  describe('Valid Code Execution', () => {
    it('should execute simple JavaScript', () => {
      const result = runCode({ code: 'return 42;' });
      expect(result.returnValue).toBe('42');
      expect(result.error).toBeUndefined();
    });

    it('should capture console.log output', () => {
      const result = runCode({ code: 'console.log("hello"); return 1;' });
      expect(result.output).toContain('hello');
    });

    it('should capture multiple console.log calls', () => {
      const result = runCode({ code: 'console.log("a"); console.log("b"); return 1;' });
      expect(result.output).toContain('a');
      expect(result.output).toContain('b');
    });

    it('should handle mathematical operations', () => {
      const result = runCode({ code: 'return Math.sqrt(16);' });
      expect(result.returnValue).toBe('4');
    });

    it('should handle JSON operations', () => {
      const result = runCode({ code: 'return JSON.stringify({a: 1, b: 2});' });
      expect(result.returnValue).toContain('"a"');
    });

    it('should handle arrays', () => {
      const result = runCode({ code: 'return [1, 2, 3].map(x => x * 2);' });
      expect(result.returnValue).toBe('[2,4,6]');
    });

    it('should handle undefined return', () => {
      const result = runCode({ code: 'var x = 5;' });
      expect(result.returnValue).toBe(null);
    });
  });

  describe('Input Validation', () => {
    it('should handle empty code', () => {
      const result = runCode({ code: '' });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('No code provided');
    });

    it('should handle whitespace-only code', () => {
      const result = runCode({ code: '   ' });
      expect(result.error).toBeDefined();
    });

    it('should handle null code', () => {
      const result = runCode({ code: null });
      expect(result.error).toBeDefined();
    });
  });

  describe('Sandbox Restrictions', () => {
    it('should not have access to process', () => {
      const result = runCode({ code: 'return typeof process;' });
      expect(result.returnValue).toBe('"undefined"');
    });

    it('should not have access to require', () => {
      const result = runCode({ code: 'return typeof require;' });
      expect(result.returnValue).toBe('"undefined"');
    });

    it('should not have access to filesystem', () => {
      const result = runCode({ code: 'return typeof require === "function" && require("fs");' });
      expect(result.returnValue).toBe('false');
    });
  });

  describe('Error Handling', () => {
    it('should handle syntax errors', () => {
      const result = runCode({ code: 'return }{' });
      expect(result.error).toBeDefined();
    });

    it('should handle runtime errors', () => {
      const result = runCode({ code: 'throw new Error("test error");' });
      expect(result.error).toContain('test error');
    });

    it('should capture errors with output', () => {
      const result = runCode({ code: 'console.log("before"); throw new Error("oops");' });
      expect(result.output).toContain('before');
      expect(result.error).toContain('oops');
    });

    it('should handle infinite loops with timeout', () => {
      const result = runCode({ code: 'while(true) {}' });
      expect(result.error).toBeDefined();
    }, { timeout: 5000 });

    it('should handle error logging', () => {
      const result = runCode({ code: 'console.error("error message"); return 1;' });
      expect(result.output).toContain('[error]');
      expect(result.output).toContain('error message');
    });
  });
});
