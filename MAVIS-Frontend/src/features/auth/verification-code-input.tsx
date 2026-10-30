"use client";
import { useId } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useLocale } from "@/lib/i18n/locale-context";

export function VerificationCodeInput({
  value,
  onChange,
  disabled,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const { t } = useLocale();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t("Verification code")}
      </label>
      <InputOTP
        id={id}
        value={value}
        onChange={onChange}
        maxLength={6}
        minLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        required
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        containerClassName="w-full"
        pasteTransformer={(text) => text.replace(/[\s-]/g, "")}
      >
        <InputOTPGroup className="w-full justify-between gap-1.5 sm:gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              className="h-11 min-w-0 flex-1 rounded-md border border-input text-lg first:rounded-md last:rounded-md"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t("Enter the six-digit code from your email.")}
      </p>
    </div>
  );
}
