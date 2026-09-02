import malerLogo from "@/assets/maler-logo.png.asset.json";

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background py-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-4 text-center sm:flex-row sm:gap-6">
        <img
          src={malerLogo.url}
          alt="לוגו מלר ייעוץ ופיתוח עסקי"
          className="h-10 w-auto object-contain"
        />
        <div className="text-sm text-muted-foreground">
          <span>© {year} כל הזכויות שמורות למלר ייעוץ ופיתוח עסקי.</span>
          <span className="mx-2 hidden sm:inline">·</span>
          <a
            href="https://omaler.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-primary underline-offset-4 hover:underline"
          >
            omaler.com
          </a>
        </div>
      </div>
    </footer>
  );
}
