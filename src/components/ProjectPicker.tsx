import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type PickerProject = { id: string; code: string; name: string };

/** Type-ahead project selector: filters by code or name as you type. */
export function ProjectPicker({
  projects,
  value,
  onChange,
  label = "בחירת פרויקט",
}: {
  projects: PickerProject[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => projects.find((p) => p.id === value), [projects, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? `${selected.code} · ${selected.name}` : "בחר פרויקט"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="חיפוש לפי קוד או שם פרויקט..." />
          <CommandList>
            <CommandEmpty>לא נמצאו פרויקטים תואמים.</CommandEmpty>
            <CommandGroup>
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.code} ${p.name}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`me-2 size-4 ${p.id === value ? "opacity-100" : "opacity-0"}`}
                    aria-hidden
                  />
                  <span className="font-mono">{p.code}</span>
                  <span className="truncate">· {p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
