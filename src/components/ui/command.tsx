export function Command({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

export function CommandDialog({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const CommandInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />;
export const CommandList = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
export const CommandEmpty = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
export const CommandGroup = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
export const CommandItem = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
export const CommandSeparator = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;
export const CommandShortcut = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;