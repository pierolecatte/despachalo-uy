export function withOrgQuery(path: string, orgId?: string | null): string {
    if (!orgId) return path;
    const [base, search] = path.split('?');
    const params = new URLSearchParams(search || '');
    params.set('org', orgId);
    return `${base}?${params.toString()}`;
}
