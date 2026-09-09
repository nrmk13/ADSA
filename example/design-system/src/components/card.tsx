import type { ComponentPropsWithRef } from "react";

export interface CardProps extends ComponentPropsWithRef<"section"> {
    elevated?: boolean;
}

export const Card = ({ elevated, ...props }: CardProps) => <section data-elevated={elevated} {...props} />;
export const CardHeader = (props: ComponentPropsWithRef<"header">) => <header {...props} />;
export const CardBody = (props: ComponentPropsWithRef<"div">) => <div {...props} />;
