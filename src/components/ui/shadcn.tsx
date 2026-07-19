import React from 'react';

type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-slate-500 dark:text-slate-400', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:transform-none',
        'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700',
        className
      )}
      {...props}
    />
  );
}

function fallbackFieldName(value: unknown, prefix: string) {
  const text = typeof value === 'string' ? value : '';
  const cleaned = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return cleaned || prefix;
}

export function Input({ className, name, id, placeholder, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const fieldName = name || id || fallbackFieldName(placeholder, 'input_field');
  return (
    <input
      id={id || fieldName}
      name={fieldName}
      placeholder={placeholder}
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors',
        'placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15',
        'dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, name, id, placeholder, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldName = name || id || fallbackFieldName(placeholder, 'textarea_field');
  return (
    <textarea
      id={id || fieldName}
      name={fieldName}
      placeholder={placeholder}
      className={cn(
        'flex min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors',
        'placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15',
        'dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50',
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold', className)} {...props} />;
}
