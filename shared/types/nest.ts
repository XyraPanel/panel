export interface Nest {
  id: string;
  uuid: string;
  author: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Egg {
  id: string;
  uuid: string;
  nestId: string;
  author: string;
  name: string;
  description: string | null;
  features: string | null;
  fileDenylist: string | null;
  updateUrl: string | null;
  dockerImage: string;
  dockerImages: string | null;
  startup: string;
  configFiles: string | null;
  configStartup: string | null;
  configStop: string | null;
  configLogs: string | null;
  scriptContainer: string | null;
  scriptEntry: string | null;
  scriptInstall: string | null;
  copyScriptFrom: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EggVariable {
  id: string;
  eggId: string;
  name: string;
  description: string | null;
  envVariable: string;
  defaultValue: string | null;
  userViewable: boolean;
  userEditable: boolean;
  rules: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WingsEggConfiguration {
  id: string;
  file_denylist: string[];
}
