"use client";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";

export function FormField({
  label,
  sublabel,
  error,
  hint,
  children,
}: {
  label: string;
  sublabel?: string | undefined;
  error?: string | undefined;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const { t } = useLocale();
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium">
        <span>{t(label)}</span>
        {sublabel && <span className="font-normal text-muted-foreground/70">{t(sublabel)}</span>}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error || hint ? `${id}-help` : undefined,
      })}
      {(error || hint) && (
        <p
          id={`${id}-help`}
          className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
          role={error ? "alert" : undefined}
        >
          {t(error ?? hint ?? "")}
        </p>
      )}
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const { t } = useLocale();
  return (
    <FormField label={label}>
      {(props) => (
        <Input
          {...props}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t(label)}
        />
      )}
    </FormField>
  );
}
export function SelectField({
  label,
  sublabel,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  sublabel?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  const { t } = useLocale();
  return (
    <FormField label={label} sublabel={sublabel}>
      {(props) => (
        <select
          {...props}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-9 w-full min-w-0 rounded-md border bg-card px-3 text-sm disabled:opacity-50"
        >
          {!value && !options.some((option) => option.value === "") && (
            <option value="" disabled>
              {t(`Select ${label.toLowerCase()}`)}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
export function FilterControls({ children }: { children: ReactNode }) {
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-end gap-3">
      {children}
    </div>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending = false,
  confirmDisabled = false,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
  confirmDisabled?: boolean;
  error?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(title)}</AlertDialogTitle>
          <AlertDialogDescription>{t(description)}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || confirmDisabled}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? t("Saving…") : t("Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(title)}</DialogTitle>
          <DialogDescription>{t(description)}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function SideSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(title)}</SheetTitle>
          <SheetDescription>{t(description)}</SheetDescription>
        </SheetHeader>
        <div className="py-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
export function ActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: readonly { label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  const { t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={t(label)}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled ?? false}
            onSelect={action.onSelect}
          >
            {t(action.label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLocale();
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("Previous")}
      </Button>
      <span aria-live="polite">
        {t(`Page ${page} of ${Math.max(1, pageCount)}`)}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {t("Next")}
      </Button>
    </nav>
  );
}
