'use strict';

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * 递归校验一个值是否符合 schema（子集：object/array/string/number/integer/enum/required/minItems）。
 * 错误以 `path: 说明` 的形式 push 进 errors。
 */
function checkValue(value, schema, path, errors) {
  if (!schema) return;

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: 值 "${value}" 不在枚举 [${schema.enum.join(' / ')}] 内`);
    return;
  }

  switch (schema.type) {
    case 'object': {
      if (typeName(value) !== 'object') {
        errors.push(`${path}: 期望 object，实际 ${typeName(value)}`);
        return;
      }
      for (const key of schema.required || []) {
        if (!(key in value)) errors.push(`${path}.${key}: 必填字段缺失`);
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) checkValue(value[key], sub, `${path}.${key}`, errors);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}: 期望 array，实际 ${typeName(value)}`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${path}: 至少需要 ${schema.minItems} 项，实际 ${value.length} 项`);
      }
      if (schema.items) {
        value.forEach((item, i) => checkValue(item, schema.items, `${path}[${i}]`, errors));
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${path}: 期望 string，实际 ${typeName(value)}`);
      }
      return;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${path}: 期望 integer，实际 ${JSON.stringify(value)}`);
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number') {
        errors.push(`${path}: 期望 number，实际 ${typeName(value)}`);
      }
      return;
    }
    default:
      return;
  }
}

module.exports = { checkValue, typeName };
