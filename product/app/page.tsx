import { auth, signIn } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "./components/BrandMark";
import { GitHubSignInButton } from "./components/GitHubSignInButton";
import { Icon } from "./components/Icon";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/app");

  const signInWithGitHub = async () => {
    "use server";
    await signIn("github", { redirectTo: "/app" });
  };

  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Tracecase home">
          <BrandMark />
          <span>Tracecase</span>
        </Link>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <h1>Know if the bug is real.</h1>
          <p>Tracecase checks the code, then tests the reported flow across browser engines, screen sizes, mobile emulation, accessibility settings, and network conditions.</p>
          <form action={signInWithGitHub}>
            <GitHubSignInButton />
          </form>
        </div>

        <section className="landing-demo" aria-label="Example Tracecase investigation">
          <header className="demo-heading">
            <span>Example investigation</span>
            <code>TC-204</code>
          </header>

          <div className="demo-grid">
            <article className="demo-card demo-report">
              <header className="demo-card-header">
                <span><Icon name="report" size={17} /> Report</span>
                <small>2m ago</small>
              </header>
              <blockquote>Checkout freezes after payment</blockquote>
              <div className="demo-facts" aria-label="Reported environment">
                <span>Safari 17.6</span>
                <span>iOS 17</span>
                <span>PST</span>
              </div>
            </article>

            <article className="demo-card demo-code">
              <header className="demo-card-header">
                <span><Icon name="code" size={17} /> Code check</span>
                <small className="demo-passed"><Icon name="check" size={12} /> Passed</small>
              </header>
              <code className="demo-file">checkout/confirm.ts</code>
              <div className="demo-test-row"><span>Test suite</span><strong>18 / 18</strong></div>
              <div className="demo-meter" aria-label="All 18 tests passed"><i /></div>
            </article>

            <article className="demo-card demo-environment-card">
              <header className="demo-card-header">
                <span><Icon name="activity" size={17} /> Environment</span>
                <small>Safari 17.6 · iOS 17</small>
              </header>
              <figure className="demo-environment-frame">
                <div className="demo-browser-bar" aria-hidden="true">
                  <span><i /><i /><i /></span>
                  <code>checkout.example</code>
                </div>
                <div className="demo-screenshot-placeholder" role="img" aria-label="Placeholder for the reproduced environment screenshot">
                  <Icon name="report" size={19} />
                  <strong>Environment capture</strong>
                  <small>Screenshot pending</small>
                </div>
                <figcaption>
                  <span>PST</span>
                  <strong><Icon name="check" size={12} /> Reproduced</strong>
                </figcaption>
              </figure>
            </article>

            <article className="demo-card demo-result">
              <header className="demo-card-header">
                <span>Result</span>
                <small className="demo-live"><i /> Evidence ready</small>
              </header>
              <div className="demo-outcome">
                <span><Icon name="check" size={20} /></span>
                <strong>Reproduced</strong>
                <small>Safari 17.6 · iOS 17 · PST</small>
              </div>
              <div className="demo-evidence" aria-label="Captured evidence">
                <span>Console</span>
                <span>Network</span>
                <span>Screenshot</span>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
