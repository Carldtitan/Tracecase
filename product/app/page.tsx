import { auth, signIn } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "./components/Icon";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/app");

  return (
    <main className="signin-page">
      <header className="public-header">
        <Link className="public-brand" href="/" aria-label="Tracecase home">
          <span className="brand-mark">T</span>
          <span>Tracecase</span>
        </Link>
      </header>
      <section className="signin-panel">
        <span className="eyebrow">Product bugs, reproduced</span>
        <h1>Find what<br />users found.</h1>
        <p>From report to tested pull request.</p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/app" });
          }}
        >
          <button className="button primary signin-button" type="submit">
            <Icon name="github" />
            Continue with GitHub
          </button>
        </form>
        <small>Private dashboard</small>
      </section>
      <div className="signin-orbit" aria-hidden="true"><span /><span /><span /></div>
    </main>
  );
}
