import { parseBuildVariantArgs } from './build-variant-options.mjs';
import { preparePackage } from './prepare-package.mjs';
import { verifyPackageResources } from './verify-package-resources.mjs';

const { metadata, passthroughArgs } = parseBuildVariantArgs(process.argv.slice(2));
if (passthroughArgs.length > 0) {
  throw new Error(`Unknown desktop build argument "${passthroughArgs[0]}".`);
}

console.log(metadata.variant === 'trial'
  ? `Preparing trial desktop build expiring at ${metadata.expiresAt}.`
  : 'Preparing regular desktop build.');
await preparePackage({ buildMetadata: metadata });
verifyPackageResources();
