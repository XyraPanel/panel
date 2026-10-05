# Contributing

## Database migrations

Schema changes must be new Drizzle migrations, generated with:

```
pnpm db:generate
```

Do not hand-edit `server/database/migrations/0000_initial.sql` or squash later
changes back into it. Once a migration has shipped to any real deployment,
treat it as immutable — editing a migration that's already been applied
somewhere means Drizzle's migration table and the actual schema silently
diverge for anyone who already ran it. Add a new migration instead, even for
small fixes.
