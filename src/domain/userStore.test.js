import { describe, expect, it, beforeEach, vi } from 'vitest';
import { authenticateUser, addUser, updateUser, deleteUser } from './userStore';

const SAMPLE_USERS = [
  { id: 'u1', username: 'manager', password: 'demo', role: 'Manager', displayName: 'Manager', camProfileId: null },
  { id: 'u2', username: 'pedro', password: 'pedro123', role: 'CAM', displayName: 'Pedro', camProfileId: 'am-pedro' },
];

describe('authenticateUser', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  });

  it('returns the matching user on correct credentials', () => {
    const user = authenticateUser('pedro', 'pedro123', SAMPLE_USERS);
    expect(user).toMatchObject({ id: 'u2', username: 'pedro' });
  });

  it('is case-insensitive on username', () => {
    const user = authenticateUser('PEDRO', 'pedro123', SAMPLE_USERS);
    expect(user).toMatchObject({ id: 'u2' });
  });

  it('returns null on wrong password', () => {
    expect(authenticateUser('pedro', 'wrongpass', SAMPLE_USERS)).toBeNull();
  });

  it('returns null for unknown username', () => {
    expect(authenticateUser('unknown', 'demo', SAMPLE_USERS)).toBeNull();
  });
});

describe('addUser', () => {
  it('adds a new user and generates a unique id', () => {
    const result = addUser(SAMPLE_USERS, { username: 'newcam', password: 'pass', displayName: 'New CAM', role: 'CAM' });
    expect(result).toHaveLength(3);
    expect(result[2].username).toBe('newcam');
    expect(result[2].id).toBeTruthy();
  });

  it('prevents duplicate usernames (case-insensitive)', () => {
    const result = addUser(SAMPLE_USERS, { username: 'PEDRO', password: 'newpass', displayName: 'Pedro 2', role: 'CAM' });
    expect(result).toHaveLength(2);
  });

  it('ignores entries with blank username', () => {
    const result = addUser(SAMPLE_USERS, { username: '', password: 'pass', displayName: 'No Name', role: 'CAM' });
    expect(result).toHaveLength(2);
  });
});

describe('updateUser', () => {
  it('updates only the targeted user', () => {
    const result = updateUser(SAMPLE_USERS, 'u2', { displayName: 'Pedro Updated' });
    expect(result.find(u => u.id === 'u2').displayName).toBe('Pedro Updated');
    expect(result.find(u => u.id === 'u1').displayName).toBe('Manager');
  });

  it('does not change array length', () => {
    const result = updateUser(SAMPLE_USERS, 'u1', { email: 'mgr@test.com' });
    expect(result).toHaveLength(2);
  });
});

describe('deleteUser', () => {
  it('removes the targeted user', () => {
    const result = deleteUser(SAMPLE_USERS, 'u2');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
  });

  it('returns same array when id not found', () => {
    const result = deleteUser(SAMPLE_USERS, 'nonexistent');
    expect(result).toHaveLength(2);
  });
});
