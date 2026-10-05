export interface EggVariableRuleResult {
  valid: boolean;
  error?: string;
}

/**
 * Minimal validator for Pterodactyl-style egg variable rule strings
 * (Laravel validation rule syntax, e.g. "required|string|max:20|in:a,b,c").
 * Supports the subset of rules eggs actually use for startup variables.
 */
export function validateEggVariableValue(
  rules: string | null | undefined,
  value: string,
): EggVariableRuleResult {
  if (!rules) {
    return { valid: true };
  }

  const ruleList = rules
    .split('|')
    .map((rule) => rule.trim())
    .filter(Boolean);

  const isEmpty = value === '' || value === null || value === undefined;
  const isNullable = ruleList.some((rule) => rule === 'nullable');
  const isRequired = ruleList.some((rule) => rule === 'required');

  if (isEmpty) {
    if (isRequired && !isNullable) {
      return { valid: false, error: 'This field is required.' };
    }
    return { valid: true };
  }

  for (const rule of ruleList) {
    const colonIndex = rule.indexOf(':');
    const name = colonIndex === -1 ? rule : rule.slice(0, colonIndex);
    const argsRaw = colonIndex === -1 ? undefined : rule.slice(colonIndex + 1);
    const args = argsRaw ? argsRaw.split(',').map((a) => a.trim()) : [];

    switch (name) {
      case 'required':
      case 'nullable':
      case 'sometimes':
      case 'present':
        break;

      case 'string':
        if (typeof value !== 'string') {
          return { valid: false, error: 'This field must be a string.' };
        }
        break;

      case 'numeric':
        if (Number.isNaN(Number(value))) {
          return { valid: false, error: 'This field must be numeric.' };
        }
        break;

      case 'integer':
        if (!/^-?\d+$/.test(value)) {
          return { valid: false, error: 'This field must be an integer.' };
        }
        break;

      case 'boolean': {
        const boolValues = ['0', '1', 'true', 'false', 'yes', 'no'];
        if (!boolValues.includes(value.toLowerCase())) {
          return { valid: false, error: 'This field must be true or false.' };
        }
        break;
      }

      case 'alpha_dash':
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return {
            valid: false,
            error: 'This field may only contain letters, numbers, dashes, and underscores.',
          };
        }
        break;

      case 'alpha_num':
        if (!/^[a-zA-Z0-9]+$/.test(value)) {
          return { valid: false, error: 'This field may only contain letters and numbers.' };
        }
        break;

      case 'url':
        try {
          void new URL(value);
        } catch {
          return { valid: false, error: 'This field must be a valid URL.' };
        }
        break;

      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return { valid: false, error: 'This field must be a valid email address.' };
        }
        break;

      case 'in':
        if (args.length > 0 && !args.includes(value)) {
          return { valid: false, error: `This field must be one of: ${args.join(', ')}.` };
        }
        break;

      case 'not_in':
        if (args.length > 0 && args.includes(value)) {
          return { valid: false, error: `This field must not be one of: ${args.join(', ')}.` };
        }
        break;

      case 'max': {
        const max = Number(args[0]);
        if (!Number.isNaN(max)) {
          const length = Number.isNaN(Number(value)) ? value.length : Number(value);
          if (length > max) {
            return { valid: false, error: `This field must not be greater than ${max}.` };
          }
        }
        break;
      }

      case 'min': {
        const min = Number(args[0]);
        if (!Number.isNaN(min)) {
          const length = Number.isNaN(Number(value)) ? value.length : Number(value);
          if (length < min) {
            return { valid: false, error: `This field must be at least ${min}.` };
          }
        }
        break;
      }

      case 'between': {
        const lo = Number(args[0]);
        const hi = Number(args[1]);
        if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
          const length = Number.isNaN(Number(value)) ? value.length : Number(value);
          if (length < lo || length > hi) {
            return { valid: false, error: `This field must be between ${lo} and ${hi}.` };
          }
        }
        break;
      }

      case 'size': {
        const size = Number(args[0]);
        if (!Number.isNaN(size)) {
          const length = Number.isNaN(Number(value)) ? value.length : Number(value);
          if (length !== size) {
            return { valid: false, error: `This field must be exactly ${size}.` };
          }
        }
        break;
      }

      case 'digits': {
        const digits = Number(args[0]);
        if (!/^\d+$/.test(value) || (!Number.isNaN(digits) && value.length !== digits)) {
          return { valid: false, error: `This field must be ${args[0]} digits.` };
        }
        break;
      }

      case 'regex': {
        const pattern = argsRaw;
        if (pattern) {
          try {
            const match = pattern.match(/^\/(.*)\/([a-z]*)$/i);
            const regex = match ? new RegExp(match[1] ?? '', match[2] ?? '') : new RegExp(pattern);
            if (!regex.test(value)) {
              return { valid: false, error: 'This field is not in the correct format.' };
            }
          } catch {
            // Malformed regex on the egg definition itself — skip enforcement rather than 500.
          }
        }
        break;
      }

      default:
        // Unrecognized rule (e.g. Laravel-specific ones we don't model) — skip rather than reject.
        break;
    }
  }

  return { valid: true };
}
