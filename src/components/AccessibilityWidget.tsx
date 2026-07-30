import { useEffect, useState } from "react";
import { Accessibility, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Flags = {
  contrast: boolean;
  grayscale: boolean;
  readableFont: boolean;
  highlightLinks: boolean;
  bigCursor: boolean;
  noMotion: boolean;
  fontScale: number;
};

const DEFAULTS: Flags = {
  contrast: false,
  grayscale: false,
  readableFont: false,
  highlightLinks: false,
  bigCursor: false,
  noMotion: false,
  fontScale: 100,
};

const STORAGE_KEY = "a11y-settings";

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [flags, setFlags] = useState<Flags>(DEFAULTS);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setFlags({ ...DEFAULTS, ...JSON.parse(raw) });
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("a11y-contrast", flags.contrast);
    root.classList.toggle("a11y-grayscale", flags.grayscale);
    root.classList.toggle("a11y-readable-font", flags.readableFont);
    root.classList.toggle("a11y-highlight-links", flags.highlightLinks);
    root.classList.toggle("a11y-big-cursor", flags.bigCursor);
    root.classList.toggle("a11y-no-motion", flags.noMotion);
    root.style.fontSize = `${flags.fontScale}%`;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  }, [flags]);

  const toggle = (key: keyof Flags) => setFlags((f) => ({ ...f, [key]: !f[key] }));

  const items: Array<{ key: keyof Flags; label: string }> = [
    { key: "contrast", label: "ניגודיות גבוהה" },
    { key: "grayscale", label: "גווני אפור" },
    { key: "readableFont", label: "גופן קריא" },
    { key: "highlightLinks", label: "הדגשת קישורים" },
    { key: "bigCursor", label: "סמן מוגדל" },
    { key: "noMotion", label: "עצירת אנימציות" },
  ];

  return (
    <div className="no-print fixed bottom-4 left-4 z-50 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label="תפריט נגישות"
          className="mb-3 w-72 rounded-xl border border-border bg-card p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">הגדרות נגישות</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="סגירת תפריט נגישות"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-lg bg-muted p-2">
            <span className="text-sm">גודל טקסט {flags.fontScale}%</span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                aria-label="הקטנת טקסט"
                className="size-8"
                onClick={() =>
                  setFlags((f) => ({ ...f, fontScale: Math.max(80, f.fontScale - 10) }))
                }
              >
                <Minus className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="הגדלת טקסט"
                className="size-8"
                onClick={() =>
                  setFlags((f) => ({ ...f, fontScale: Math.min(160, f.fontScale + 10) }))
                }
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={Boolean(flags[item.key])}
                  onClick={() => toggle(item.key)}
                  className={`w-full rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                    flags[item.key]
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => setFlags(DEFAULTS)}
          >
            <RotateCcw className="size-4" />
            איפוס הגדרות
          </Button>

          <p className="mt-3 text-xs text-muted-foreground">
            האתר פועל בהתאם לתקן ישראלי ת״י 5568 ולתקנות שוויון זכויות לאנשים עם מוגבלות.
          </p>
        </div>
      )}

      <Button
        size="icon"
        aria-label="פתיחת תפריט נגישות"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="size-12 rounded-full shadow-lg"
      >
        <Accessibility className="size-6" />
      </Button>
    </div>
  );
}