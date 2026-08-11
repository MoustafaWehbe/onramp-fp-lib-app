import { Outlet } from "react-router-dom";

/**
 * The reading surface's shell: nothing. Same mechanism as SharedLayout — a
 * route-level layout swap — but where the contributor view shrinks the nav,
 * the reader removes it entirely: B8's rule is a single quiet bar over the
 * book, and that bar belongs to the page (it needs the book's title), not
 * the layout. h-dvh so the surface owns exactly the viewport, phones included.
 */
export function ReaderLayout() {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <Outlet />
    </div>
  );
}
