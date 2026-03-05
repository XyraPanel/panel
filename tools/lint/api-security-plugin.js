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
        const isAccountClientRoute = filename.includes('account/') || filename.includes('client/') || filename.includes('me.');
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

export default eslintCompatPlugin({
  meta: { name: "xyra-api-ruleset" },
  rules: {
    "require-security-calls": requireSecurityCalls,
  }
});
