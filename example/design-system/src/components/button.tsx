import type { ComponentPropsWithRef, ReactNode } from "react";

export type ButtonColor = "primary" | "secondary" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
    color?: ButtonColor;
    size?: ButtonSize;
    isLoading?: boolean;
    children?: ReactNode;
}

export const Button = ({ color = "primary", size = "md", isLoading, ...props }: ButtonProps) => {
    return <button data-color={color} data-size={size} aria-busy={isLoading} {...props} />;
};
