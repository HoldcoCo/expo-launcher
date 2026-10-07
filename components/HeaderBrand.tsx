import type { ReactNode } from "react";
import { HoldcoLogo } from "@/components/HoldcoLogo";

type HeaderBrandProps = {
  /** Title block (h1 + subtitle); unchanged copy from each page. */
  children: ReactNode;
};

/**
 * Shared page-header brand: logo, line divider, then the title block.
 * Logo is 22px below 640px and 28px from 640px up; CSS keeps aspect ratio.
 */
export function HeaderBrand({ children }: HeaderBrandProps) {
  return (
    <div className="mr-auto flex min-w-0 items-center">
      <HoldcoLogo
        height={28}
        className="h-[22px] w-auto shrink-0 sm:h-7"
      />
      <span
        aria-hidden="true"
        className="mx-4 h-8 w-px shrink-0 bg-line"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
