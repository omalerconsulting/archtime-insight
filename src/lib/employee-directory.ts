export function selectableEmployees<T extends { is_deleted: boolean }>(employees: T[]): T[] {
  return employees.filter((employee) => !employee.is_deleted);
}

export function validReportTarget(target: string, employees: { id: string }[]): string {
  return target === "me" || target === "all" || employees.some((employee) => employee.id === target)
    ? target
    : "me";
}