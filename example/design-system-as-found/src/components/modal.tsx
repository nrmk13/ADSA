import type { ReactNode } from "react";

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children?: ReactNode;
}

export const Modal = ({ isOpen, title, children }: ModalProps) => (isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null);
