import { useEffect, useRef, type ReactNode } from "react";
export default function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="workspace-modal-header">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
