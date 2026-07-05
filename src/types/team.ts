import { z } from 'zod';

export const TeamRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

export const TeamPermissionSchema = z.enum([
  'profiles:create',
  'profiles:edit',
  'profiles:delete',
  'profiles:launch',
  'profiles:import',
  'sync:run',
  'proxies:manage',
  'team:manage',
  'rpa:record',
  'rpa:replay',
]);
export type TeamPermission = z.infer<typeof TeamPermissionSchema>;

export const TeamMemberSchema = z.object({
  email: z.string().email(),
  role: TeamRoleSchema,
  addedAt: z.number(),
  addedBy: z.string().email().optional(),
  googleVerified: z.boolean().optional(),
});

export const TeamConfigSchema = z.object({
  members: z.array(TeamMemberSchema).default([]),
  currentUserEmail: z.string().email().nullable().default(null),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;

export interface TeamState {
  currentUserEmail: string | null;
  currentRole: TeamRole | null;
  members: TeamMember[];
  permissions: TeamPermission[];
}

export const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  owner: [
    'profiles:create', 'profiles:edit', 'profiles:delete', 'profiles:launch',
    'profiles:import', 'sync:run', 'proxies:manage', 'team:manage',
    'rpa:record', 'rpa:replay',
  ],
  admin: [
    'profiles:create', 'profiles:edit', 'profiles:delete', 'profiles:launch',
    'profiles:import', 'sync:run', 'proxies:manage', 'rpa:record', 'rpa:replay',
  ],
  member: [
    'profiles:create', 'profiles:edit', 'profiles:launch',
    'sync:run', 'rpa:record', 'rpa:replay',
  ],
  viewer: ['profiles:launch', 'rpa:replay'],
};
