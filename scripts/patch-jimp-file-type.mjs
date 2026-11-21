import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageFile = require.resolve('@jimp/core/package.json');
const { version } = JSON.parse(readFileSync(packageFile, 'utf8'));
const file = join(dirname(packageFile), 'dist/utils/image-bitmap.js');
const source = readFileSync(file, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const originalHash = '05b60c76db68f742e451f0a92389d706fdf9d23573732463dcc9a7d5bcb4eb54';
const patchedHash = 'a164ce2f9fcdb2ada32a37706b9a63e561523345a301f1aef59893389fa1f970';

// Jimp's CommonJS detector uses the old API. Keep parsing in maintained
// file-type, including its ASF/ZIP fixes, without copying parser code.
if (version !== '0.22.12') throw Error('Review the Jimp compatibility patch for version ' + version);
if (hash(source) !== patchedHash) {
  if (hash(source) !== originalHash) throw Error('Unexpected Jimp source; compatibility patch refused');
  const patched = source
    .replace('var _fileType = _interopRequireDefault(require("file-type"));\n', '')
    .replace(
      '  const fileTypeFromBuffer = await _fileType.default.fromBuffer(buffer);',
      '  const { fileTypeFromBuffer: detectFileType } = await import("file-type");\n' +
      '  const fileTypeFromBuffer = await detectFileType(buffer);',
    );
  if (hash(patched) !== patchedHash) throw Error('Jimp compatibility patch did not match');
  writeFileSync(file, patched);
}
