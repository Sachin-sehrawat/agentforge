import vm from 'node:vm';

/**
 * Runs a short JavaScript snippet inside a restricted VM sandbox.
 * NOTE: Node's `vm` module is NOT a true security boundary against
 * determined attackers. This is meant for an educational/demo tool
 * running on a trusted local machine, not for untrusted multi-tenant use.
 *
 * @param {{code: string}} input
 */
export function runCode({ code }) {
  if (typeof code !== 'string' || !code.trim()) {
    return { error: 'No code provided.' };
  }

  const logs = [];
  const sandbox = {
    console: {
      log: (...args) => logs.push(args.map(stringify).join(' ')),
      error: (...args) => logs.push('[error] ' + args.map(stringify).join(' ')),
    },
    Math,
    JSON,
  };

  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

  try {
    const script = new vm.Script(`(function(){\n${code}\n})()`);
    const result = script.runInContext(context, { timeout: 2000 });
    return {
      output: logs.join('\n'),
      returnValue: result === undefined ? null : stringify(result),
    };
  } catch (err) {
    return { output: logs.join('\n'), error: err.message };
  }
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
