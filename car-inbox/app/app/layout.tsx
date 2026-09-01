import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { logout } from "@/app/actions/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  if (!user) redirect("/login");

  return (
    <>
      <div className="topbar">
        <Link className="brand" href="/app/inbox">
          🚗 Auto-inbox
        </Link>
        <nav className="nav">
          <Link href="/app/inbox">Inbox</Link>
          <Link href="/app/plates">Mijn kentekens</Link>
          <Link href="/app/send">Versturen</Link>
          <form action={logout} style={{ display: "inline" }}>
            <button className="btn small secondary" type="submit">
              Uitloggen
            </button>
          </form>
        </nav>
      </div>
      {children}
    </>
  );
}
