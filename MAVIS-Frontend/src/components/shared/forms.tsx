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
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs font-medium">
        <span>{label}</span>
        {sublabel && <span className="font-normal text-muted-foreground/70">{sublabel}</span>}
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
          {error ?? hint}
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
  return (
    <FormField label={label}>
      {(props) => (
        <Input
          {...props}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={label}
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
          {!value && (
            <option value="" disabled>
              Select {label.toLowerCase()}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Saving…" : "Confirm"}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Drawer({
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children}
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={label}>
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
            {action.label}
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
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-xs">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span aria-live="polite">
        Page {page} of {Math.max(1, pageCount)}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
