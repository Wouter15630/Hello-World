// Functionele standaardmeldingen (functioneel-first). De sociale laag
// ("koffie?") is bewust géén MVP-preset.
export const PRESETS: { key: string; label: string }[] = [
  { key: "lichten", label: "Je lichten staan aan" },
  { key: "dubbelparkeren", label: "Je staat dubbelgeparkeerd" },
  { key: "laadpaal", label: "De laadpaal is klaar / je mag opladen" },
  { key: "band", label: "Je bandenspanning lijkt laag" },
  { key: "raam", label: "Een raam staat open" },
  { key: "vrij", label: "Eigen bericht…" },
];

export function presetLabel(key: string): string {
  return PRESETS.find((p) => p.key === key)?.label ?? key;
}
