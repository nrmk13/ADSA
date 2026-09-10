import type { ComponentPropsWithRef } from "react";

export interface InputProps extends ComponentPropsWithRef<"input"> {
    label: string;
    hint?: string;
    isInvalid?: boolean;
}

export const Input = ({ label, hint, isInvalid, ...props }: InputProps) => (
    <label>
        {label}
        <input aria-invalid={isInvalid} {...props} />
        {hint}
    </label>
);
