import fs from 'fs-extra';
import { join } from 'path';
import { rollup, Plugin } from 'rollup';
import rollupCommonjs from '@rollup/plugin-commonjs';
import rollupJson from '@rollup/plugin-json';
import rollupNodeResolve from '@rollup/plugin-node-resolve';
import type { BuildOptions } from '../../utils/options';

/**
 * Creates a rollup plugin to inline various compiler dependencies (e.g. rollup functions)
 * @param opts the options being used during a build of the Stencil compiler
 * @param inputDir the directory where known compiler dependencies can be read from
 * @returns the plugin that inlines the compiler dependencies
 */
export function inlinedCompilerDepsPlugin(opts: BuildOptions, inputDir: string): Plugin {
  return {
    name: 'inlinedCompilerDepsPlugin',
    /**
     * A rollup build hook for resolving Stencil's compiler dependencies
     * [Source](https://rollupjs.org/guide/en/#resolveid)
     * @param id the importee exactly as it is written in an import statement in the source code
     * @returns a string that resolves an import to some id, null otherwise
     */
    resolveId(id: string): string | null {
      if (id === '@compiler-deps') {
        return id;
      }
      return null;
    },
    /**
     * A rollup build hook for loading various compiler dependencies. [Source](https://rollupjs.org/guide/en/#load)
     * @param id the path of the module to load
     * @returns the compiler's dependencies, pre-bundled
     */
    load(id: string): Promise<string> | null {
      if (id === '@compiler-deps') {
        return bundleCompilerDeps(opts, inputDir);
      }
      return null;
    },
  };
}

/**
 * Bundles compiler dependencies (e.g. rollup utilities) to be used in the Stencil output. Writes the results to disk
 * and returns its contents. The file written to disk may be used as a simple cache to speed up subsequent build times.
 * @param opts the options being used during a build of the Stencil compiler
 * @param inputDir the directory to resolve the pre-transpiled compiler dependencies from
 * @returns the contents of the file containing compiler dependencies
 */
async function bundleCompilerDeps(opts: BuildOptions, inputDir: string): Promise<string> {
  const cacheFile = join(opts.buildDir, 'compiler-deps-bundle-cache.js');

  if (!opts.isProd) {
    try {
      return await fs.readFile(cacheFile, 'utf8');
    } catch (e) {}
  }

  const build = await rollup({
    input: join(inputDir, 'sys', 'modules', 'compiler-deps.js'),
    external: ['fs', 'module', 'path', 'util', 'resolve'],
    plugins: [
      rollupNodeResolve({
        preferBuiltins: false,
      }),
      rollupCommonjs(),
      rollupJson({
        preferConst: true,
      }),
    ],
    treeshake: {
      moduleSideEffects: false,
    },
  });

  await build.write({
    format: 'es',
    file: cacheFile,
    preferConst: true,
    banner: `// Rollup ${opts.rollupVersion}`,
  });

  return await fs.readFile(cacheFile, 'utf8');
}
