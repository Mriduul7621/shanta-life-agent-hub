/**
 * ESM resolve hook for QA scripts that import the app's TS sources
 * from Node. Node 24 strips types natively, but its loader does not
 * resolve extensionless relative imports the way Vite does
 * (src/data/retailData.ts imports './period', not './period.ts'), so
 * a bare import fails with ERR_MODULE_NOT_FOUND. This hook retries a
 * failed relative specifier with a .ts (then .tsx) extension.
 *
 * QA-only: loaded via module.register() from the suite that needs it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) throw err;
    const parentPath = fileURLToPath(context.parentURL);
    const base = path.resolve(path.dirname(parentPath), specifier);
    for (const ext of ['.ts', '.tsx']) {
      if (fs.existsSync(base + ext)) {
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
    throw err;
  }
}
