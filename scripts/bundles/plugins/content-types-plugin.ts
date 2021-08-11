import type { Plugin } from 'rollup';
import type { BuildOptions } from '../../utils/options';
import fs from 'fs-extra';
import { join } from 'path';

/**
 * Creates a rollup plugin for generating a mapping of extensions to MIME data types used by the Stencil dev-server
 * @param opts the options being used during a build of the Stencil compiler
 * @returns the plugin can resolve MIME data types based on file extension
 */
export function contentTypesPlugin(opts: BuildOptions): Plugin {
  return {
    name: 'contentTypesPlugin',
    /**
     * A rollup id hook for resolving MIME types by extension [Source](https://rollupjs.org/guide/en/#resolveid)
     * @param importee the importee exactly as it is written in an import statement in the source code
     * @returns a resolution to an import to a different id
     */
    resolveId(id: string): string | null {
      if (id.endsWith('content-types-db.json')) {
        return id;
      }
      return null;
    },
    /**
     * A rollup build hook replacing the placeholder `content-types-db.json` file at build time with a mapping of
     * extensions to MIME data types. [Source](https://rollupjs.org/guide/en/#load)
     * @param id the path of the module to load
     * @returns the mapping of extensions to MIME data types
     */
    load(id: string): Promise<string> | null {
      if (id.endsWith('content-types-db.json')) {
        return createContentTypeData(opts);
      }
      return null;
    },
  };
}

/**
 * Representation of an internal mapping of extension-to-MIME data types
 */
type ExtensionData = { ext: string; mimeType: string };

/**
 * Creates a mapping of file extension to MIME data types
 * @param opts the options being used during a build of the Stencil compiler
 * @returns a stringified object literal mapping file extensions (keys) to MIME data types (values)
 */
async function createContentTypeData(opts: BuildOptions): Promise<string> {
  // create a focused content-type lookup object from the mime db json file
  const mimeDbSrcPath = join(opts.nodeModulesDir, 'mime-db', 'db.json');
  const mimeDbJson = await fs.readJson(mimeDbSrcPath);

  const extData: ExtensionData[] = [];

  Object.keys(mimeDbJson).forEach((mimeType) => {
    const mimeTypeData = mimeDbJson[mimeType];
    if (Array.isArray(mimeTypeData.extensions)) {
      mimeTypeData.extensions.forEach((ext: string) => {
        extData.push({
          ext,
          mimeType,
        });
      });
    }
  });

  const extensionToMimeTypes: Record<string, string> = {};
  extData
    .sort((a: ExtensionData, b: ExtensionData) => {
      if (a.ext < b.ext) return -1;
      if (a.ext > b.ext) return 1;
      return 0;
    })
    .forEach((x: ExtensionData) => (extensionToMimeTypes[x.ext] = x.mimeType));

  return `export default ${JSON.stringify(extensionToMimeTypes)}`;
}
