export const PERMISSIONS = ["view", "upload", "download", "rename_move", "delete", "share", "manage_folders"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const TEMPLATES: Record<string, Permission[]> = {
  Viewer: ["view", "download"],
  Contributor: ["view", "download", "upload"],
  Editor: ["view", "download", "upload", "rename_move", "manage_folders"],
  Manager: [...PERMISSIONS],
};
