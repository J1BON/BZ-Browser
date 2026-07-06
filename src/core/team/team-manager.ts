import fs from 'fs/promises';
import path from 'path';
import {
  TeamConfigSchema,
  ROLE_PERMISSIONS,
  type TeamConfig,
  type TeamMember,
  type TeamPermission,
  type TeamRole,
  type TeamState,
} from '../../types/team.js';

export class TeamManager {
  private configPath: string;
  private config: TeamConfig = { members: [], currentUserEmail: null };

  constructor(dataDir: string) {
    this.configPath = path.join(dataDir, 'team.json');
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      this.config = TeamConfigSchema.parse(JSON.parse(raw));
    } catch {
      this.config = { members: [], currentUserEmail: null };
      await this.save();
    }
  }

  async save(): Promise<void> {
    const tmp = this.configPath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.config, null, 2));
    await fs.rename(tmp, this.configPath);
  }

  async setCurrentUser(email: string): Promise<TeamState> {
    this.config.currentUserEmail = email.toLowerCase();
    const existing = this.config.members.find((m) => m.email === email.toLowerCase());
    if (!existing) {
      this.config.members.push({
        email: email.toLowerCase(),
        role: this.config.members.length === 0 ? 'owner' : 'member',
        addedAt: Date.now(),
        googleVerified: true,
      });
    } else {
      existing.googleVerified = true;
    }
    await this.save();
    return this.getState();
  }

  getState(): TeamState {
    const email = this.config.currentUserEmail;
    if (!email) {
      return {
        currentUserEmail: null,
        currentRole: null,
        members: this.config.members,
        // Only grant owner-level access when no members are configured (fresh install / local-only mode)
        // If members exist, a non-authenticated user gets no permissions
        permissions: this.config.members.length === 0 ? ROLE_PERMISSIONS.owner : [],
      };
    }

    const member = this.config.members.find((m) => m.email === email);
    const role: TeamRole = member?.role ?? (this.config.members.length === 0 ? 'owner' : 'viewer');
    return {
      currentUserEmail: email,
      currentRole: role,
      members: this.config.members,
      permissions: ROLE_PERMISSIONS[role],
    };
  }

  can(permission: TeamPermission): boolean {
    const state = this.getState();
    if (!state.currentUserEmail && state.members.length === 0) return true;
    return state.permissions.includes(permission);
  }

  require(permission: TeamPermission): void {
    if (!this.can(permission)) {
      throw new Error(`Permission denied: ${permission}. Your role: ${this.getState().currentRole ?? 'none'}`);
    }
  }

  async addMember(email: string, role: TeamRole, addedBy?: string): Promise<TeamMember> {
    this.require('team:manage');
    const normalized = email.toLowerCase();
    const existing = this.config.members.find((m) => m.email === normalized);
    if (existing) {
      existing.role = role;
      await this.save();
      return existing;
    }
    const member: TeamMember = {
      email: normalized,
      role,
      addedAt: Date.now(),
      addedBy: addedBy?.toLowerCase(),
    };
    this.config.members.push(member);
    await this.save();
    return member;
  }

  async removeMember(email: string): Promise<void> {
    this.require('team:manage');
    const normalized = email.toLowerCase();
    const target = this.config.members.find((m) => m.email === normalized);
    if (target?.role === 'owner') {
      throw new Error('Cannot remove the owner');
    }
    this.config.members = this.config.members.filter((m) => m.email !== normalized);
    await this.save();
  }

  async updateRole(email: string, role: TeamRole): Promise<void> {
    this.require('team:manage');
    const member = this.config.members.find((m) => m.email === email.toLowerCase());
    if (!member) throw new Error('Member not found');
    if (member.role === 'owner' && role !== 'owner') {
      const owners = this.config.members.filter((m) => m.role === 'owner');
      if (owners.length <= 1) throw new Error('Cannot demote the only owner');
    }
    member.role = role;
    await this.save();
  }
}
