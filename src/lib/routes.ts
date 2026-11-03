export const homeFor = (role: string) =>
  role === "SUPER_ADMIN" ? "/admin" : role === "COMPANY_ADMIN" ? "/company" : "/app";
