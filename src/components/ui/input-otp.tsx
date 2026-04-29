export const InputOTP = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />;
export const InputOTPGroup = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
export const InputOTPSlot = (props: React.HTMLAttributes<HTMLDivElement> & { index?: number }) => <div {...props} />;
export const InputOTPSeparator = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;