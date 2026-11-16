export const verificationCodePattern = /^[0-9]{6}$/;
export const isCompleteVerificationCode = (value: string) => verificationCodePattern.test(value);
