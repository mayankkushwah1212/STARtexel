export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  services?: Record<string, string>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export const APP_CONFIG = {
  name: 'startexel',
  version: '0.1.0',
  ports: {
    web: 3000,
    api: 4000,
    ai: 8000,
  },
} as const;
