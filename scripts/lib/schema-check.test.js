'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { checkValue } = require('./schema-check');

const schema = {
  type: 'object',
  required: ['kind', 'score'],
  properties: {
    kind: { type: 'string', enum: ['a', 'b'] },
    score: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
    child: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
};

function errorsFor(value) {
  const errors = [];
  checkValue(value, schema, '$', errors);
  return errors;
}

test('合法对象通过', () => {
  assert.deepStrictEqual(errorsFor({ kind: 'a', score: 3 }), []);
});

test('缺必填字段报错', () => {
  assert.match(errorsFor({ kind: 'a' }).join('\n'), /\$\.score: 必填字段缺失/);
});

test('枚举外的值报错', () => {
  assert.match(errorsFor({ kind: 'z', score: 1 }).join('\n'), /枚举/);
});

test('类型不符报错', () => {
  assert.match(errorsFor({ kind: 'a', score: 'x' }).join('\n'), /期望 integer/);
});

test('数组元素逐个校验', () => {
  assert.match(errorsFor({ kind: 'a', score: 1, tags: [1] }).join('\n'), /\$\.tags\[0\]: 期望 string/);
});

test('minItems 生效', () => {
  const s = { type: 'array', items: { type: 'string' }, minItems: 2 };
  const errors = [];
  checkValue(['x'], s, '$.a', errors);
  assert.match(errors.join('\n'), /至少需要 2 项/);
});

test('嵌套 object 必填下钻', () => {
  assert.match(errorsFor({ kind: 'a', score: 1, child: {} }).join('\n'), /\$\.child\.id: 必填字段缺失/);
});

test('顶层类型不符不继续下钻', () => {
  const errors = [];
  checkValue([], schema, '$', errors);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /期望 object/);
});
