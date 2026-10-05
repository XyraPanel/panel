import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import {
  requireSecurityCalls,
  requireStatusCodeCheck,
  noHardcodedSessionCookie,
  noCoerceBoolean,
} from '../../../tools/lint/api-security-plugin.js';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

describe('xyra-api-ruleset/require-security-calls', () => {
  ruleTester.run('require-security-calls', requireSecurityCalls, {
    valid: [
      {
        name: 'admin route with both requireAdmin and requireAdminApiKeyPermission',
        filename: 'server/api/admin/nodes/index.get.ts',
        code: `
          export default defineEventHandler(async (event) => {
            await requireAdmin(event);
            await requireAdminApiKeyPermission(event, ADMIN_ACL_RESOURCES.NODES, ADMIN_ACL_PERMISSIONS.READ);
            return { data: [] };
          });
        `,
      },
      {
        name: 'wings daemon route using requireWingsAuth does not need admin ACL',
        filename: 'server/api/remote/servers/index.get.ts',
        code: `
          export default defineEventHandler(async (event) => {
            await requireWingsAuth(event);
            return { data: [] };
          });
        `,
      },
    ],
    invalid: [
      {
        name: 'admin route with requireAdmin but missing requireAdminApiKeyPermission',
        filename: 'server/api/admin/nodes/index.get.ts',
        code: `
          export default defineEventHandler(async (event) => {
            await requireAdmin(event);
            return { data: [] };
          });
        `,
        errors: [{ message: /Admin ACL Violation/ }],
      },
      {
        name: 'admin route with no auth helpers at all',
        filename: 'server/api/admin/nodes/index.get.ts',
        code: `
          export default defineEventHandler(async (event) => {
            return { data: [] };
          });
        `,
        errors: [
          { message: /Anonymous API Leak/ },
          { message: /Admin API Violation/ },
        ],
      },
    ],
  });
});

describe('xyra-api-ruleset/require-status-code-check', () => {
  ruleTester.run('require-status-code-check', requireStatusCodeCheck, {
    valid: [
      {
        name: 'checks both statusCode and status',
        filename: 'server/middleware/auth.global.ts',
        code: `
          try {
            doThing();
          } catch (error) {
            if (error && typeof error === 'object' && ('statusCode' in error || 'status' in error)) {
              throw error;
            }
          }
        `,
      },
      {
        name: 'checks only statusCode',
        filename: 'server/middleware/auth.global.ts',
        code: `
          try {
            doThing();
          } catch (error) {
            if (error && typeof error === 'object' && 'statusCode' in error) {
              throw error;
            }
          }
        `,
      },
    ],
    invalid: [
      {
        name: 'checks only status, missing statusCode',
        filename: 'server/middleware/auth.global.ts',
        code: `
          try {
            doThing();
          } catch (error) {
            if (error && typeof error === 'object' && 'status' in error) {
              throw error;
            }
          }
        `,
        errors: [{ message: /Incomplete Error Check/ }],
      },
    ],
  });
});

describe('xyra-api-ruleset/no-hardcoded-session-cookie', () => {
  ruleTester.run('no-hardcoded-session-cookie', noHardcodedSessionCookie, {
    valid: [
      {
        name: 'uses getSessionCookie helper, no hardcoded literal',
        filename: 'server/api/account/sessions/index.delete.ts',
        code: `
          const token = getSessionCookie(new Headers({ cookie: getRequestHeader(event, 'cookie') || '' }));
        `,
      },
      {
        name: 'hardcoded cookie name allowed inside auth.ts itself',
        filename: 'server/utils/auth.ts',
        code: `
          const cookieName = 'better-auth.session_token';
        `,
      },
    ],
    invalid: [
      {
        name: 'hardcoded cookie name outside auth.ts',
        filename: 'server/api/account/sessions/index.delete.ts',
        code: `
          const currentToken = getCookie(event, 'better-auth.session_token');
        `,
        errors: [{ message: /Hardcoded Cookie Name/ }],
      },
    ],
  });
});

describe('xyra-api-ruleset/no-coerce-boolean', () => {
  ruleTester.run('no-coerce-boolean', noCoerceBoolean, {
    valid: [
      {
        name: 'strict z.boolean()',
        filename: 'shared/schema/admin/users.ts',
        code: `const schema = z.object({ rootAdmin: z.boolean().optional() });`,
      },
      {
        name: 'z.coerce.number() is unrelated and allowed',
        filename: 'shared/schema/admin/users.ts',
        code: `const schema = z.object({ page: z.coerce.number().default(1) });`,
      },
    ],
    invalid: [
      {
        name: 'z.coerce.boolean() on a schema field',
        filename: 'shared/schema/admin/users.ts',
        code: `const schema = z.object({ rootAdmin: z.coerce.boolean().optional() });`,
        errors: [{ message: /Unsafe Coercion/ }],
      },
    ],
  });
});
