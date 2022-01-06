import type * as d from '../../declarations';
import { generateTypes } from '../types/generate-types';
import { isOutputTargetDistTypes, isOutputTargetDistCustomElements } from './output-utils';

export const outputTypes = async (config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) => {
  const outputTargetDistTypes = config.outputTargets.filter(isOutputTargetDistTypes );
  const outputTargetDistCustomElements = config.outputTargets.filter(isOutputTargetDistCustomElements );

  if (outputTargetDistTypes.length === 0 && outputTargetDistCustomElements.length == 0) {
    return;
  }
  const outputTargets = [...outputTargetDistTypes, ...outputTargetDistCustomElements];

  const timespan = buildCtx.createTimeSpan(`generate types started`, true);

  await Promise.all(outputTargets.map((outputsTarget) => generateTypes(config, compilerCtx, buildCtx, outputsTarget)));

  timespan.finish(`generate types finished`);
};
