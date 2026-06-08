// Normaliseer een kenteken zodat invoer met spaties/streepjes/kleine letters
// altijd op hetzelfde record matcht. Bewaart geen opmaak, alleen [A-Z0-9].
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Toon een kenteken in groepjes (puur cosmetisch voor de UI).
export function formatPlate(normalized: string): string {
  return normalized.replace(/(.{2})/g, "$1-").replace(/-$/, "");
}

export function isValidPlate(input: string): boolean {
  const n = normalizePlate(input);
  return n.length >= 4 && n.length <= 8;
}
