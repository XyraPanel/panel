export interface SeedUser {
  name: string;
  username: string;
  email: string;
  password: string;
  avatar: string | null;
  rootAdmin?: boolean;
  role?: string;
  permissions?: string[];
}
