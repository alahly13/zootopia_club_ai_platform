export const ADMIN_EMAILS = [
  'elmahdy@admin.com',
  'alahlyeagle13@gmail.com',
  'alahlyeagle@gmail.com'
];

export const RESERVED_USERNAMES = [
  'elmahdy'
];

export interface AdminIdentity {
  email: string;
  level: string;
  role: string;
}

export const ADMIN_IDENTITIES: AdminIdentity[] = [
  {
    email: 'elmahdy@admin.com',
    level: 'primary',
    role: 'admin'
  },
  {
    email: 'alahlyeagle13@gmail.com',
    level: 'secondary',
    role: 'admin'
  },
  {
    email: 'alahlyeagle@gmail.com',
    level: 'third',
    role: 'admin'
  }
];
