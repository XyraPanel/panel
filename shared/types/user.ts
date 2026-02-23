import type { Pagination } from './audit';

export interface User {
  id: string;
  username: string;
  email: string;
  nameFirst: string | null;
  nameLast: string | null;
  language: string;
  rootAdmin: boolean;
  emailVerified: Date | null;
  image: string | null;
  useTotp: boolean;
  totpAuthenticatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithCounts extends User {
  serversOwned?: number;
  serversAccess?: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password?: string;
  nameFirst?: string;
  nameLast?: string;
  language?: string;
  rootAdmin?: boolean;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  password?: string;
  nameFirst?: string;
  nameLast?: string;
  language?: string;
  rootAdmin?: boolean;
}

export interface AdminCreateUserPayload {
  username: string;
  email: string;
  password: string;
  nameFirst?: string;
  nameLast?: string;
  language?: string;
  role: 'user' | 'admin';
}

export interface AdminUpdateUserPayload {
  username?: string;
  email?: string;
  password?: string;
  nameFirst?: string;
  nameLast?: string;
  role?: 'user' | 'admin';
}

export interface UserListResponse {
  users: UserWithCounts[];
  pagination: Pagination;
}

export interface UserResponse {
  user: User;
  generatedPassword?: string;
}
