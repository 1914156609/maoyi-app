import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCraft, allFields, validateCraft, calculate } from '../src/lib/domain.mjs';
import { calculateCraft } from '../src/lib/knitting.mjs';

const craft = () => ({ ...emptyCraft(), name:'数值语法验收',style:'开衫',density:68,rowDensity:40,
  sizes:{chest:50,bodyLength:60,shoulder:37,armhole:23,shoulderSlope:3,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,bodyRib:6,underarmFlat:2,sleeveLength:55,sleeveWidth:34,sleeveCuffWidth:20,sleeveCapWidth:10,sleeveCapHeight:15,sleeveRib:6,placketWidth:3,placketLength:60} });
const invalid = ['0x10','0b10','0o10',' 1 ','\t1\n','1\n',true];
test('all 21 dimension fields reject numeric syntax that Java cannot persist', () => {
  for (const [field] of allFields) for (const value of invalid) {
    const c = craft(); c.sizes[field] = value;
    assert.ok(validateCraft(c)[field], `draft ${field}: ${JSON.stringify(value)}`);
    assert.ok(calculateCraft(c).fieldErrors[field], `calculation ${field}: ${JSON.stringify(value)}`);
  }
});
test('both density fields enforce the same decimal syntax as Java', () => {
  for (const field of ['density','rowDensity']) for (const value of invalid) {
    const c = craft(); c[field] = value;
    assert.ok(validateCraft(c)[field], `draft ${field}: ${JSON.stringify(value)}`);
    assert.ok(calculateCraft(c).fieldErrors[field], `calculation ${field}: ${JSON.stringify(value)}`);
  }
});
test('valid signed decimals, leading decimal points and scientific notation still calculate and save', () => {
  const c = craft();c.sizes.chest='+5e1';c.density='6.8e1';c.sizes.shoulderSlope='.5';
  assert.deepEqual(validateCraft(c), {});
  assert.deepEqual(calculateCraft(c).errors, []);
  assert.equal(calculateCraft(c).input.sizes.chest, 50);
});
test('legacy scalar conversions also reject coercible nondecimal strings instead of treating them as physical measurements', () => {
  for (const value of invalid) {
    assert.ok(calculate({chest:value},68,40).errors.length);
    assert.ok(calculate({chest:50},value,40).errors.length);
  }
});
