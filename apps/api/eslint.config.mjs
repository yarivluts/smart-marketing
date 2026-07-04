import base from '@growthos/eslint-config/base';

const HTTP_METHOD_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Delete',
  'Patch',
  'Options',
  'Head',
  'All',
]);
const PERMISSION_DECORATORS = new Set(['RequirePermission', 'Public']);

function decoratorName(decorator) {
  const expr = decorator.expression;
  if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
    return expr.callee.name;
  }
  if (expr.type === 'Identifier') {
    return expr.name;
  }
  return undefined;
}

/**
 * KAN-24 AC: "no route reachable without explicit permission annotation".
 * Flags any NestJS route handler (a class method carrying an HTTP-method
 * decorator) that lacks `@RequirePermission(...)` on itself or its
 * controller class, unless the class or method is `@Public()`.
 */
const requirePermissionAnnotation = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Every NestJS route handler must carry @RequirePermission(...) or @Public() (deny-by-default authz, KAN-24).',
    },
    schema: [],
    messages: {
      missing:
        'Route handler "{{name}}" has an HTTP method decorator but no @RequirePermission(...) or @Public() annotation on the method or its controller class.',
    },
  },
  create(context) {
    function checkRouteHandler(node) {
      const memberNames = (node.decorators ?? []).map(decoratorName);
      if (!memberNames.some((name) => HTTP_METHOD_DECORATORS.has(name))) {
        return;
      }
      if (memberNames.some((name) => PERMISSION_DECORATORS.has(name))) {
        return;
      }

      const classDeclaration = node.parent?.parent;
      const classDecorators = (classDeclaration?.decorators ?? []).map(decoratorName);
      if (classDecorators.some((name) => PERMISSION_DECORATORS.has(name))) {
        return;
      }

      context.report({
        node,
        messageId: 'missing',
        data: { name: node.key?.name ?? '<anonymous>' },
      });
    }

    return {
      // `@Get() getFoo() {}` — the common NestJS handler style.
      MethodDefinition: checkRouteHandler,
      // `@Get() getFoo = () => {}` — an arrow-function class field, also
      // valid NestJS syntax and just as reachable as a MethodDefinition.
      PropertyDefinition: checkRouteHandler,
    };
  },
};

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    plugins: {
      growthos: { rules: { 'require-permission-annotation': requirePermissionAnnotation } },
    },
    rules: {
      'growthos/require-permission-annotation': 'error',
    },
  },
];
