import { evaluate } from 'mathjs';

/**
 * Evaluates a mathematical expression safely using mathjs.
 * @param {{expression: string}} input
 */
export function runCalculator({ expression }) {
  if (typeof expression !== 'string' || !expression.trim()) {
    return { error: 'No expression provided.' };
  }
  try {
    const result = evaluate(expression);
    return { expression, result: typeof result === 'object' ? result.toString() : String(result) };
  } catch (err) {
    return { expression, error: `Could not evaluate expression: ${err.message}` };
  }
}
