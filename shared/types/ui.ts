export interface QuickLink {
  label: string;
  icon: string;
  to?: string;
  onClick?: () => void;
}

export interface MountUI {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ServerUI {
  uuid: string;
  name: string;
  description?: string;
  status?: string;
  limits?: {
    cpu?: number;
    memory?: number;
    disk?: number;
  };
}

export interface AdminSettingsTabDefinition {
  label: string;
  value: string;
  icon?: string;
  component: string;
  order?: number;
  permission?: string;
}

export interface NodeOption {
  id: string;
  name: string;
  locationId?: string;
}

export interface UserOption {
  id: string;
  username: string;
  email?: string;
}

export interface EggOption {
  id: string;
  name: string;
  nestId?: string;
  nestName?: string;
}

export interface AllocationOption {
  id: string;
  ip: string;
  port: number;
  assigned: boolean;
}
