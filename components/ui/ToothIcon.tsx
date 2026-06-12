import type { SVGProps } from "react";

/** Фирменная иконка зуба (в lucide нет tooth). */
export function ToothIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 5.2C10.8 4 9.3 3 7.7 3 5 3 3.5 5.2 3.5 7.6c0 2.1 1 3.4 1.5 5.3.5 1.9.6 4.6 1.7 7 .4.9 1.7.8 2-.1.5-1.6.6-4.3 1.6-4.3h3.4c1 0 1.1 2.7 1.6 4.3.3.9 1.6 1 2 .1 1.1-2.4 1.2-5.1 1.7-7 .5-1.9 1.5-3.2 1.5-5.3C20.5 5.2 19 3 16.3 3c-1.6 0-3.1 1-4.3 2.2Z" />
    </svg>
  );
}
