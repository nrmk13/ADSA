import type { ComponentPropsWithRef } from "react";

export interface TableProps extends ComponentPropsWithRef<"table"> {
    density?: "compact" | "comfortable";
}

export const Table = ({ density = "comfortable", ...props }: TableProps) => <table data-density={density} {...props} />;
export const TableRow = (props: ComponentPropsWithRef<"tr">) => <tr {...props} />;
export const TableCell = (props: ComponentPropsWithRef<"td">) => <td {...props} />;
