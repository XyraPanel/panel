import { and, eq, useDrizzle, tables } from '#server/utils/drizzle';
import type { Permission, PermissionCheck, UserPermissions } from '#shared/types/server';
import { invalidateServerSubusersCache } from './subusers';
import { buildUserPermissionsMapCacheKey } from './cache-keys';
import { withCache } from './cache';
import { randomUUID } from 'node:crypto';

type PermissionHierarchy = Record<string, Permission[]>;

export class PermissionManager {
  private db = useDrizzle();

  private permissionHierarchy: PermissionHierarchy = {
    'admin.*': [
      'admin.servers.*',
      'admin.users.*',
      'admin.nodes.*',
      'admin.locations.*',
      'admin.nests.*',
      'admin.eggs.*',
      'admin.mounts.*',
      'admin.settings.*',
    ],
    'admin.servers.*': [
      'server.view',
      'server.console',
      'server.power',
      'server.command',
      'server.files.read',
      'server.files.write',
      'server.files.delete',
      'server.files.upload',
      'server.files.download',
      'server.files.compress',
      'server.backup.create',
      'server.backup.restore',
      'server.backup.delete',
      'server.backup.download',
      'server.database.create',
      'server.database.read',
      'server.database.update',
      'server.database.delete',
      'server.schedule.create',
      'server.schedule.read',
      'server.schedule.update',
      'server.schedule.delete',
      'server.settings.read',
      'server.settings.update',
      'server.users.read',
      'server.users.create',
      'server.users.update',
      'server.users.delete',
      'admin.*',
      'admin.servers.*',
      'admin.users.*',
      'admin.nodes.*',
      'admin.locations.*',
      'admin.nests.*',
      'admin.eggs.*',
      'admin.mounts.*',
      'admin.settings.*',
    ],
    'server.files.*': [
      'server.files.read',
      'server.files.write',
      'server.files.delete',
      'server.files.upload',
      'server.files.download',
      'server.files.compress',
    ],
    'server.backup.*': [
      'server.backup.create',
      'server.backup.restore',
      'server.backup.delete',
      'server.backup.download',
    ],
    'server.database.*': [
      'server.database.create',
      'server.database.read',
      'server.database.update',
      'server.database.delete',
    ],
    'server.schedule.*': [
      'server.schedule.create',
      'server.schedule.read',
      'server.schedule.update',
      'server.schedule.delete',
    ],
    'server.users.*': [
      'server.users.read',
      'server.users.create',
      'server.users.update',
      'server.users.delete',
    ],
  };

  private defaultPermissionSets = {
    owner: [
      'server.view',
      'server.console',
      'server.power',
      'server.command',
      'server.files.read',
      'server.files.write',
      'server.files.delete',
      'server.files.upload',
      'server.files.download',
      'server.files.compress',
      'server.backup.create',
      'server.backup.restore',
      'server.backup.delete',
      'server.backup.download',
      'server.database.create',
      'server.database.read',
      'server.database.update',
      'server.database.delete',
      'server.schedule.create',
      'server.schedule.read',
      'server.schedule.update',
      'server.schedule.delete',
      'server.settings.read',
      'server.settings.update',
      'server.users.read',
      'server.users.create',
      'server.users.update',
      'server.users.delete',
    ] as Permission[],

    moderator: [
      'server.view',
      'server.console',
      'server.power',
      'server.command',
      'server.files.read',
      'server.files.write',
      'server.files.upload',
      'server.files.download',
      'server.backup.create',
      'server.backup.download',
      'server.database.read',
      'server.schedule.read',
      'server.settings.read',
    ] as Permission[],

    viewer: [
      'server.view',
      'server.console',
      'server.files.read',
      'server.files.download',
      'server.backup.download',
      'server.database.read',
      'server.schedule.read',
      'server.settings.read',
    ] as Permission[],
  };

  private expandPermissions(permissions: Permission[]): Permission[] {
    const expanded = new Set<Permission>(permissions);

    for (const permission of permissions) {
      const hierarchyPerms = this.permissionHierarchy[permission];
      if (hierarchyPerms) {
        hierarchyPerms.forEach((p) => expanded.add(p));
      }
    }

    return Array.from(expanded);
  }

  async getUserPermissions(userId: string): Promise<UserPermissions> {
    const cacheKey = buildUserPermissionsMapCacheKey(userId);
    const cached = await withCache<SerializedUserPermissions>(
      cacheKey,
      async () => this.serializeUserPermissions(await this.computeUserPermissions(userId)),
      { ttl: 60 },
    );

    return this.deserializeUserPermissions(cached);
  }

  private async computeUserPermissions(userId: string): Promise<UserPermissions> {
    const result = await this.db
      .select()
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .limit(1);

    const user = result[0];

    if (!user) {
      throw new Error('User not found');
    }

    const isAdmin = user.rootAdmin;

    const serverPermissions = new Map<string, Permission[]>();

    if (isAdmin) {
      return {
        userId,
        isAdmin: true,
        serverPermissions,
      };
    }

    const ownedServers = await this.db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.ownerId, userId));

    for (const server of ownedServers) {
      serverPermissions.set(server.id, this.defaultPermissionSets.owner);
    }

    const subusers = await this.db
      .select()
      .from(tables.serverSubusers)
      .where(eq(tables.serverSubusers.userId, userId));

    for (const subuser of subusers) {
      try {
        const permissions = JSON.parse(subuser.permissions) as Permission[];
        const validPermissions = permissions.filter((p) => this.getAllPermissions().includes(p));
        const expandedPermissions = this.expandPermissions(validPermissions);
        serverPermissions.set(subuser.serverId, expandedPermissions);
      } catch (error) {
        console.error(`Failed to parse permissions for subuser ${subuser.id}:`, error);
        serverPermissions.set(subuser.serverId, this.defaultPermissionSets.viewer);
      }
    }

    return {
      userId,
      isAdmin: false,
      serverPermissions,
    };
  }

  async checkPermission(
    userId: string,
    permission: Permission,
    serverId?: string,
  ): Promise<PermissionCheck> {
    const userPermissions = await this.getUserPermissions(userId);

    if (userPermissions.isAdmin) {
      return { hasPermission: true };
    }

    if (permission.startsWith('admin.')) {
      return {
        hasPermission: false,
        reason: 'Admin permissions required',
      };
    }

    if (serverId) {
      const serverPerms = userPermissions.serverPermissions.get(serverId);
      if (!serverPerms) {
        return {
          hasPermission: false,
          reason: 'No access to this server',
        };
      }

      const hasPermission = serverPerms.includes(permission);
      return {
        hasPermission,
        reason: hasPermission ? undefined : `Missing permission: ${permission}`,
      };
    }

    return {
      hasPermission: false,
      reason: 'Insufficient permissions',
    };
  }

  async checkServerAccess(userId: string, serverId: string): Promise<PermissionCheck> {
    return this.checkPermission(userId, 'server.view', serverId);
  }

  async addServerSubuser(
    serverId: string,
    userId: string,
    permissions: Permission[],
    actorUserId: string,
  ): Promise<void> {
    const actorCheck = await this.checkPermission(actorUserId, 'server.users.create', serverId);
    if (!actorCheck.hasPermission) {
      throw new Error('Permission denied: Cannot manage server users');
    }

    const existingResult = await this.db
      .select()
      .from(tables.serverSubusers)
      .where(
        and(eq(tables.serverSubusers.serverId, serverId), eq(tables.serverSubusers.userId, userId)),
      )
      .limit(1);

    if (existingResult[0]) {
      throw new Error('User already has access to this server');
    }

    const serverResult = await this.db
      .select()
      .from(tables.servers)
      .where(eq(tables.servers.id, serverId))
      .limit(1);

    if (serverResult[0]?.ownerId === userId) {
      throw new Error('User is already the server owner');
    }

    const now = new Date().toISOString();
    await this.db.insert(tables.serverSubusers).values({
      id: randomUUID(),
      serverId,
      userId,
      permissions: JSON.stringify(permissions),
      createdAt: now,
      updatedAt: now,
    });

    await invalidateServerSubusersCache(serverId, [userId]);
  }

  async updateServerSubuser(
    serverId: string,
    userId: string,
    permissions: Permission[],
    actorUserId: string,
  ): Promise<void> {
    const actorCheck = await this.checkPermission(actorUserId, 'server.users.update', serverId);
    if (!actorCheck.hasPermission) {
      throw new Error('Permission denied: Cannot manage server users');
    }

    const result = await this.db
      .select()
      .from(tables.serverSubusers)
      .where(
        and(eq(tables.serverSubusers.serverId, serverId), eq(tables.serverSubusers.userId, userId)),
      )
      .limit(1);

    const subuser = result[0];
    if (!subuser) {
      throw new Error('Subuser not found');
    }

    await this.db
      .update(tables.serverSubusers)
      .set({
        permissions: JSON.stringify(permissions),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tables.serverSubusers.id, subuser.id));

    await invalidateServerSubusersCache(serverId, [userId]);
  }

  async removeServerSubuser(serverId: string, userId: string, actorUserId: string): Promise<void> {
    const actorCheck = await this.checkPermission(actorUserId, 'server.users.delete', serverId);
    if (!actorCheck.hasPermission) {
      throw new Error('Permission denied: Cannot manage server users');
    }

    const result = await this.db
      .select()
      .from(tables.serverSubusers)
      .where(
        and(eq(tables.serverSubusers.serverId, serverId), eq(tables.serverSubusers.userId, userId)),
      )
      .limit(1);

    const subuser = result[0];
    if (!subuser) {
      throw new Error('Subuser not found');
    }

    await this.db.delete(tables.serverSubusers).where(eq(tables.serverSubusers.id, subuser.id));

    await invalidateServerSubusersCache(serverId, [userId]);
  }

  async getServerSubusers(serverId: string, actorUserId: string) {
    const actorCheck = await this.checkPermission(actorUserId, 'server.users.read', serverId);
    if (!actorCheck.hasPermission) {
      throw new Error('Permission denied: Cannot view server users');
    }

    const subusers = await this.db
      .select({
        id: tables.serverSubusers.id,
        userId: tables.serverSubusers.userId,
        permissions: tables.serverSubusers.permissions,
        createdAt: tables.serverSubusers.createdAt,
        updatedAt: tables.serverSubusers.updatedAt,
        userName: tables.users.username,
        userEmail: tables.users.email,
      })
      .from(tables.serverSubusers)
      .leftJoin(tables.users, eq(tables.serverSubusers.userId, tables.users.id))
      .where(eq(tables.serverSubusers.serverId, serverId));

    return subusers.map((subuser) => ({
      id: subuser.id,
      userId: subuser.userId,
      userName: subuser.userName,
      userEmail: subuser.userEmail,
      permissions: JSON.parse(subuser.permissions || '[]') as Permission[],
      createdAt: subuser.createdAt,
      updatedAt: subuser.updatedAt,
    }));
  }

  getDefaultPermissionSets() {
    return this.defaultPermissionSets;
  }

  getAllPermissions(): Permission[] {
    return [
      'server.view',
      'server.console',
      'server.power',
      'server.command',
      'server.files.read',
      'server.files.write',
      'server.files.delete',
      'server.files.upload',
      'server.files.download',
      'server.files.compress',
      'server.backup.create',
      'server.backup.restore',
      'server.backup.delete',
      'server.backup.download',
      'server.database.create',
      'server.database.read',
      'server.database.update',
      'server.database.delete',
      'server.schedule.create',
      'server.schedule.read',
      'server.schedule.update',
      'server.schedule.delete',
      'server.settings.read',
      'server.settings.update',
      'server.users.read',
      'server.users.create',
      'server.users.update',
      'server.users.delete',
      'admin.*',
      'admin.servers.*',
      'admin.users.*',
      'admin.nodes.*',
      'admin.locations.*',
      'admin.nests.*',
      'admin.eggs.*',
      'admin.mounts.*',
      'admin.settings.*',
    ];
  }

  private serializeUserPermissions(userPermissions: UserPermissions): SerializedUserPermissions {
    return {
      ...userPermissions,
      serverPermissions: Array.from(userPermissions.serverPermissions.entries()),
    };
  }

  private deserializeUserPermissions(
    userPermissions: SerializedUserPermissions | UserPermissions,
  ): UserPermissions {
    if (userPermissions.serverPermissions instanceof Map) {
      return userPermissions as UserPermissions;
    }

    const entries = Array.isArray(userPermissions.serverPermissions)
      ? userPermissions.serverPermissions
      : Object.entries(userPermissions.serverPermissions ?? {});

    return {
      ...userPermissions,
      serverPermissions: new Map(entries as Array<[string, Permission[]]>),
    };
  }
}

type SerializedUserPermissions = Omit<UserPermissions, 'serverPermissions'> & {
  serverPermissions:
    | Map<string, Permission[]>
    | Array<[string, Permission[]]>
    | Record<string, Permission[]>;
};

export const permissionManager = new PermissionManager();
