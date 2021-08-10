import type { Plugin } from 'rollup';
import type { BuildOptions } from '../../utils/options';
import path from 'path';

/**
 * Rollup plugin that adds various debugging comments to the compiler
 * @param opts the options being used during a build of the Stencil compiler
 * @returns the plugin for adding debugging comments
 */
export function moduleDebugPlugin(opts: BuildOptions): Plugin {
  return {
    name: 'moduleDebugPlugin',
    /**
     * Rollup build hook that inserts the comments to determine where source code originates from
     * @param code the code for a module to modify
     * @param id the module's identifier
     * @returns the code, prefixed with a debug comment
     */
    transform(code: string, id: string): string {
      let debugPath = path.relative(opts.buildDir, id);
      debugPath = debugPath.replace(/\\/g, '/');
      const comment = `// MODULE: ${debugPath}\n`;
      return comment + code;
    },
  };
}
