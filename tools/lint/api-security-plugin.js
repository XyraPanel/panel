/**
 * XyraPanel API Security Ruleset
 * Enforces authentication, validation, ORM safety, and audit trails.
 */
import { eslintCompatPlugin } from "@oxlint/plugins";

const VALIDATED_INPUT_FUNCTIONS = ['getValidatedQuery', 'getValidatedBody', 'readValidatedBody', 'readValidatedBodyWithLimit'];
const RAW_INPUT_FUNCTIONS = ['getQuery', 'readBody', 'getBody'];
const AUDIT_FUNCTIONS = ['recordAuditEventFromRequest', 'recordAuditEvent', 'recordServerActivity'];
const MUTATING_DB_CALLS = ['insert', 'update', 'delete'];

const AUTH_HELPERS = {
  ADMIN: ['requireAdmin', 'requireWingsAuth', 'requireAdminApiKeyPermission', 'getNodeIdFromAuth'],
  ACCOUNT: ['requireAccountUser', 'requireClientUser', 'requireAuth', 'requireApiKeyAuth'],
  SERVER: ['requireServerPermission', 'getServerWithAccess']
};

const ALL_AUTH_HELPERS = new Set([...AUTH_HELPERS.ADMIN, ...AUTH_HELPERS.ACCOUNT, ...AUTH_HELPERS.SERVER]);

function collectCalls(target, found = new Set(), visited = new Set()) {
  if (!target || typeof target !== 'object') return found;
  if (visited.has(target)) return found;
  visited.add(target);

  if (target.type === 'CallExpression') {
    const name = target.callee?.name || target.callee?.property?.name;
    if (name) found.add(name);
  }

  if (Array.isArray(target)) {
    for (const item of target) collectCalls(item, found, visited);
  } else {
    for (const key in target) {
      if (key === 'parent' || key === 'loc' || key === 'range' || key === 'type') continue;
      const child = target[key];
      if (child && typeof child === 'object') collectCalls(child, found, visited);
    }
  }
  return found;
}

const requireSecurityCalls = {
  createOnce(context) {
    return {
      Program(node) {
        const filename = context.filename ?? '';
        const sourceCode = context.sourceCode.text;

        if (!filename.includes('server/api/')) return;

        const isAdminRoute = filename.includes('admin/') || filename.includes('wings/');
        const isAccountClientRoute = filename.includes('account/') || filename.includes('client/') || /\/me\.[a-z]+\.ts$/.test(filename);
        const isSystemRoute = filename.includes('system/') || filename.includes('test-config.get.ts');
        const isServerScoped = (filename.includes('servers/[') || filename.includes('me/servers/')) && !filename.includes('remote/');
        const isMutatingFile = /\.(post|put|delete|patch)\.[jt]s$/.test(filename);

        const eventHandlerNode = node.body.find(s =>
          s.type === 'ExportDefaultDeclaration' &&
          s.declaration?.type === 'CallExpression' &&
          s.declaration?.callee?.name === 'defineEventHandler'
        );

        if (!eventHandlerNode) return;
        const handlerFn = eventHandlerNode.declaration.arguments[0];
        if (!handlerFn?.body) return;

        const calls = collectCalls(handlerFn.body);

        let hasIfStatement = false;
        let hasProcessEnv = false;
        let hasConsoleLog = false;
        const authCalled = [];
        let validationWithAny = false;

        function deepWalk(target, visited = new Set()) {
          if (!target || typeof target !== 'object') return;
          if (visited.has(target)) return;
          visited.add(target);

          if (target.type === 'IfStatement') hasIfStatement = true;
          if (target.type === 'MemberExpression') {
             if (target.object?.name === 'process' && target.property?.name === 'env') hasProcessEnv = true;
             if (target.object?.name === 'console' && (target.property?.name === 'log' || target.property?.name === 'warn' || target.property?.name === 'error')) hasConsoleLog = true;
          }
          if (target.type === 'CallExpression') {
             const name = target.callee?.name || target.callee?.property?.name;
             if (name && ALL_AUTH_HELPERS.has(name)) authCalled.push(name);
             if (name && VALIDATED_INPUT_FUNCTIONS.includes(name)) {
                const arg = target.arguments[1];
                if (arg && sourceCode.substring(arg.range[0], arg.range[1]).includes('.any()') && !isSystemRoute) validationWithAny = true;
             }
          }

          if (Array.isArray(target)) {
            for (const item of target) deepWalk(item, visited);
          } else {
            for (const key in target) {
              if (key === 'parent' || key === 'loc' || key === 'range') continue;
              const child = target[key];
              if (child && typeof child === 'object') deepWalk(child, visited);
            }
          }
        }
        deepWalk(handlerFn.body);

        const isPublicRoute =
          filename.includes('health.get.ts') ||
          filename.includes('manifest.get.ts') ||
          filename.includes('/auth/') ||
          filename.includes('pagination.get.ts') ||
          filename.includes('maintenance-status.get.ts') ||
          filename.includes('branding.get.ts') ||
          filename.includes('configuration.get.ts') ||
          filename.includes('sftp/auth.post.ts') ||
          (filename.includes('seed.post.ts') && sourceCode.includes('Authorization'));

        if (!isPublicRoute && authCalled.length === 0) {
           context.report({ node: eventHandlerNode, message: "[CRITICAL] Anonymous API Leak: Route contains NO authentication helpers. All 300+ APIs must be tier-locked." });
        }

        if (isAdminRoute && !authCalled.some(h => AUTH_HELPERS.ADMIN.includes(h))) {
           context.report({ node: eventHandlerNode, message: "[CRITICAL] Admin API Violation: Missing 'requireAdmin' or 'requireWingsAuth'." });
        }

        // Session-authenticated admin routes (requireAdmin) also need the per-key ACL
        // check so a narrowly-scoped admin API key can't reach endpoints beyond its
        // granted resources. requireWingsAuth/getNodeIdFromAuth routes are daemon-to-
        // panel calls, not admin-API-key calls, so they're exempt.
        const usesSessionAdminAuth = authCalled.includes('requireAdmin');
        if (usesSessionAdminAuth && !authCalled.includes('requireAdminApiKeyPermission')) {
          context.report({ node: eventHandlerNode, message: "[CRITICAL] Admin ACL Violation: Routes using 'requireAdmin' MUST also call 'requireAdminApiKeyPermission' so scoped API keys can't exceed their granted resources." });
        }

        if (isAccountClientRoute && !authCalled.some(h => AUTH_HELPERS.ACCOUNT.includes(h))) {
           context.report({ node: eventHandlerNode, message: "[CRITICAL] Account API Violation: Missing 'requireAccountUser' or 'requireAuth'."});
        }
        if (isServerScoped && !isAdminRoute && !calls.has('getServerWithAccess')) {
           context.report({ node: eventHandlerNode, message: "[SECURITY] Server ACL Violation: Server-scoped routes MUST use 'getServerWithAccess' to resolve permissions." });
        }

        const hasDrizzleMutation = MUTATING_DB_CALLS.some(fn => calls.has(fn));

        if (hasDrizzleMutation && !AUDIT_FUNCTIONS.some(fn => calls.has(fn))) {
          context.report({ node: eventHandlerNode, message: "[AUDIT] Missing Audit Log: DB mutation detected without 'recordAuditEventFromRequest' or 'recordServerActivity'." });
        }

        if (isMutatingFile && hasDrizzleMutation) {
           const hasTryCatch = handlerFn.body?.body?.some(s => s.type === 'TryStatement');
           if (!hasTryCatch) context.report({ node: eventHandlerNode, message: "[SHELF-LIFE] Exception Leak: Mutating routes MUST use try/catch wrapper." });

           const usesValidatedBody = calls.has('readValidatedBodyWithLimit') || calls.has('readValidatedBody') || calls.has('getValidatedBody');
           const isBoundaryExempt = filename.endsWith('.delete.ts') || filename.endsWith('power.put.ts') || filename.endsWith('change-egg.post.ts') || filename.endsWith('install.post.ts') || filename.endsWith('index.patch.ts');
           if (!isBoundaryExempt && usesValidatedBody && !sourceCode.includes('shared/schema') && !sourceCode.includes('shared/types')) {
             context.report({ node: eventHandlerNode, message: "[BOUNDARY] Architectural Boundary Violation: Mutation endpoint must import from '#shared/schema'." });
           }
        }

        if (hasConsoleLog) context.report({ node: eventHandlerNode, message: "[POLICY] Standardized Logging: Use '#server/utils/logger' instead of 'console'." });
        if (hasProcessEnv && !isSystemRoute) context.report({ node: eventHandlerNode, message: "[CONFIG] Env Leakage: Use 'useRuntimeConfig()' instead of 'process.env'." });
        if (validationWithAny) context.report({ node: eventHandlerNode, message: "[VALIDATION] Lazy Validation: 'z.any()' is forbidden in API routes." });

        if (RAW_INPUT_FUNCTIONS.some(fn => calls.has(fn)) && !VALIDATED_INPUT_FUNCTIONS.some(fn => calls.has(fn))) {
          context.report({ node: eventHandlerNode, message: "[INPUT] Unvalidated Input: Found raw input hook. Use validated Zod helpers." });
        }

        if ((calls.has('getRouterParam') || calls.has('getRouterParams')) && !hasIfStatement) {
           context.report({ node: eventHandlerNode, message: "[LOGIC] Unchecked Parameters: Variables extracted from URL but never validated with an 'if' check." });
        }

        if ((calls.has('update') || calls.has('delete')) && !calls.has('where')) {
           context.report({ node: eventHandlerNode, message: "[ORM] Destructive Mutation: 'update' or 'delete' called without '.where()'." });
        }
      }
    };
  }
};

// Catches: catch (error) { if ('status' in error) throw error; ... }
// h3's createError({ status }) normalizes onto `.statusCode`, not `.status` — an
// H3Error instance never actually has a `.status` property. A check that tests only
// 'status' silently swallows every createError thrown in the try block instead of
// re-throwing it, and execution falls through to whatever code follows. This bit us
// for real in server/middleware/auth.global.ts: three separate security checks
// (invalid API key, IP restriction, forced password reset) were being silently
// discarded because of exactly this pattern.
const requireStatusCodeCheck = {
  createOnce(context) {
    return {
      CatchClause(node) {
        const filename = context.filename ?? '';
        if (!filename.includes('server/')) return;

        const sourceCode = context.sourceCode.text;
        const catchText = sourceCode.substring(node.range[0], node.range[1]);

        const testsStatus = /['"]status['"]\s+in\s+\w/.test(catchText);
        const testsStatusCode = /['"]statusCode['"]\s+in\s+\w/.test(catchText);

        if (testsStatus && !testsStatusCode) {
          context.report({
            node,
            message: "[ERROR-HANDLING] Incomplete Error Check: catch block tests only 'status' in error, but h3's createError() normalizes onto '.statusCode'. Use \"'statusCode' in error || 'status' in error\" or the swallowed error will silently fall through instead of propagating.",
          });
        }
      },
    };
  },
};

// Catches hardcoded better-auth session cookie names outside the one place that
// should compute them. auth.ts sets useSecureCookies based on NODE_ENV, which
// prefixes the real cookie name with `__Secure-` in production — a hardcoded
// 'better-auth.session_token' literal silently misses that cookie in production.
// Use better-auth's own getSessionCookie() (from 'better-auth/cookies'), which
// checks both the plain and prefixed names.
const noHardcodedSessionCookie = {
  createOnce(context) {
    return {
      Literal(node) {
        const filename = context.filename ?? '';
        if (!filename.includes('server/')) return;
        if (filename.endsWith('server/utils/auth.ts')) return;

        if (typeof node.value === 'string' && node.value.includes('session_token') && node.value.includes('better-auth')) {
          context.report({
            node,
            message: "[SESSION] Hardcoded Cookie Name: don't hardcode the better-auth session cookie name — it silently misses the '__Secure-' prefix used in production. Use getSessionCookie() from 'better-auth/cookies' instead.",
          });
        }
      },
    };
  },
};

// Catches z.coerce.boolean() anywhere in shared schemas. z.coerce.boolean() is
// effectively `Boolean(value)`, so the string "false" — a very natural thing for a
// client to send — coerces to `true`. We shipped exactly this bug on the
// admin user-update schema's `rootAdmin` field: PATCH { rootAdmin: "false" } granted
// root admin instead of revoking it. Use z.boolean() (strict) and coerce explicitly
// at the call site if you truly need query-string coercion.
const noCoerceBoolean = {
  createOnce(context) {
    return {
      CallExpression(node) {
        const filename = context.filename ?? '';
        if (!filename.includes('shared/schema/') && !filename.includes('server/api/')) return;

        const callee = node.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.name === 'boolean' &&
          callee.object?.type === 'MemberExpression' &&
          callee.object.property?.name === 'coerce'
        ) {
          context.report({
            node,
            message: "[VALIDATION] Unsafe Coercion: z.coerce.boolean() treats any non-empty string (including \"false\") as true. Use z.boolean() instead, especially for security-sensitive fields like rootAdmin/role/permissions.",
          });
        }
      },
    };
  },
};

// Named exports so RuleTester (test/unit/lint/api-security-plugin.spec.ts) can test
// each rule individually — eslintCompatPlugin mutates these objects in place to add
// the ESLint-compatible `.create` method, so the same references work with either API.
export {
  requireSecurityCalls,
  requireStatusCodeCheck,
  noHardcodedSessionCookie,
  noCoerceBoolean,
};

export default eslintCompatPlugin({
  meta: { name: "xyra-api-ruleset" },
  rules: {
    "require-security-calls": requireSecurityCalls,
    "require-status-code-check": requireStatusCodeCheck,
    "no-hardcoded-session-cookie": noHardcodedSessionCookie,
    "no-coerce-boolean": noCoerceBoolean,
  }
});
