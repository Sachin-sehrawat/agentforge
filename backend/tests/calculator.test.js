import { describe, it, expect } from 'vitest';
import { runCalculator } from '../src/tools/calculator.js';

describe('Calculator Tool', () => {
  describe('Valid Expressions', () => {
    it('should evaluate basic arithmetic', () => {
      const result = runCalculator({ expression: '2 + 3' });
      expect(result.result).toBe('5');
    });

    it('should evaluate multiplication and division', () => {
      const result = runCalculator({ expression: '10 * 2 / 5' });
      expect(result.result).toBe('4');
    });

    it('should evaluate powers', () => {
      const result = runCalculator({ expression: '2^3' });
      expect(result.result).toBe('8');
    });

    it('should evaluate square root', () => {
      const result = runCalculator({ expression: 'sqrt(144)' });
      expect(result.result).toBe('12');
    });

    it('should handle parentheses', () => {
      const result = runCalculator({ expression: '(3 + 5) * 2' });
      expect(result.result).toBe('16');
    });

    it('should evaluate trigonometric functions', () => {
      const result = runCalculator({ expression: 'sin(0)' });
      expect(result.result).toBe('0');
    });
  });

  describe('Input Validation', () => {
    it('should handle empty expression', () => {
      const result = runCalculator({ expression: '' });
      expect(result.error).toBeDefined();
      expect(result.error).toContain('No expression provided');
    });

    it('should handle null/undefined expression', () => {
      const result = runCalculator({ expression: null });
      expect(result.error).toBeDefined();
    });

    it('should handle whitespace-only expression', () => {
      const result = runCalculator({ expression: '   ' });
      expect(result.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid syntax', () => {
      const result = runCalculator({ expression: '2 + + 3' });
      expect(result.error).toBeDefined();
    });

    it('should handle undefined variables', () => {
      const result = runCalculator({ expression: 'x + 5' });
      expect(result.error).toBeDefined();
    });

    it('should return expression in response', () => {
      const expr = '2 + 2';
      const result = runCalculator({ expression: expr });
      expect(result.expression).toBe(expr);
    });
  });
});
