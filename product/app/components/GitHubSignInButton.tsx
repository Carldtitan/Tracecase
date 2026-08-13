"use client";

import { useFormStatus } from "react-dom";
import { Icon } from "./Icon";

export function GitHubSignInButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button primary landing-cta" type="submit" disabled={pending} aria-disabled={pending}>
      <Icon name="github" />
      {pending ? "Opening GitHub…" : "Continue with GitHub"}
    </button>
  );
}
