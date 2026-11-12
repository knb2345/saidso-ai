import Rail from './Rail';

/** The product itself. The intro page at `/` sits outside this group and has no rail. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <div className="main">{children}</div>
    </div>
  );
}
