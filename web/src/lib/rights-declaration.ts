/** Pure helper shared by the checkout form and the server: is the customer's rights declaration required for this cart? */
export function requiresRightsDeclaration(lines: { fileIds?: readonly string[] | null; design?: unknown }[]): boolean {
  return lines.some((l) => (l.fileIds?.length ?? 0) > 0 || !!l.design);
}
