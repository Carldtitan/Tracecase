"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";

type Step = "observed" | "expected" | "frequency" | "consent" | "sending" | "done" | "error";
type Message = { id: string; role: "agent" | "user"; text: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const prompts: Record<Exclude<Step, "sending" | "done" | "error">, string> = {
  observed: "What went wrong?",
  expected: "What should have happened?",
  frequency: "How often does it happen?",
  consent: "Share browser diagnostics?",
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export default function IntakePage() {
  return <Suspense fallback={<main className="reporter-page" />}><Reporter /></Suspense>;
}

function Reporter() {
  const [step, setStep] = useState<Step>("observed");
  const [input, setInput] = useState("");
  const [observed, setObserved] = useState("");
  const [expected, setExpected] = useState("");
  const [frequency, setFrequency] = useState("I don’t know");
  const [diagnostics, setDiagnostics] = useState(true);
  const [messages, setMessages] = useState<Message[]>([{ id: "hello", role: "agent", text: prompts.observed }]);
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [reference, setReference] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const searchParams = useSearchParams();
  const projectKey = searchParams.get("projectKey") ?? "";
  const pageRoute = searchParams.get("page") ?? "";
  const embedded = searchParams.get("embed") === "1";
  const configured = Boolean(projectKey);

  function closeReporter() {
    if (window.parent === window) return;
    const targetOrigin = document.referrer ? new URL(document.referrer).origin : "*";
    window.parent.postMessage("tracecase:close", targetOrigin);
  }

  const speak = useCallback((text: string) => {
    if (!voiceReplies || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, [voiceReplies]);

  function addAgent(text: string) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "agent", text }]);
    speak(text);
  }

  function addUser(text: string) {
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
  }

  function acceptText() {
    const value = input.trim();
    if (!value) return;
    addUser(value);
    setInput("");
    if (step === "observed") { setObserved(value); setStep("expected"); addAgent(prompts.expected); }
    if (step === "expected") { setExpected(value); setStep("frequency"); addAgent(prompts.frequency); }
  }

  function chooseFrequency(value: string) {
    setFrequency(value);
    addUser(value);
    setStep("consent");
    addAgent(prompts.consent);
  }

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const Recognition = getRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = navigator.language;
    recognition.interimResults = false;
    recognition.onresult = (event) => setInput(event.results[0]?.[0]?.transcript ?? "");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function submit() {
    setStep("sending");
    try {
      const origin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
      const sessionResponse = await fetch("/api/widget/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectKey, origin }) });
      if (!sessionResponse.ok) throw new Error("session unavailable");
      const session = await sessionResponse.json() as { token: string };
      const response = await fetch("/api/widget/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectKey,
          sessionToken: session.token,
          expected,
          observed,
          frequency,
          route: pageRoute || undefined,
          environment: diagnostics ? {
            browser: navigator.userAgent.includes("Firefox") ? "firefox" : navigator.userAgent.includes("AppleWebKit") && !navigator.userAgent.includes("Chrome") ? "webkit" : "chromium",
            viewport: { width: window.innerWidth, height: window.innerHeight },
            locale: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            featureFlags: {},
            source: "reported",
          } : {},
          consent: { technicalDetails: diagnostics, screenshot: false, attachments: false },
          unknowns: ["Session state", "Account state", "Feature flags"],
        }),
      });
      if (!response.ok) throw new Error("report unavailable");
      const result = await response.json() as { caseId: string };
      setReference(result.caseId);
      setStep("done");
      addAgent("Report sent.");
    } catch {
      setStep("error");
      addAgent("I couldn’t send that. Try again.");
    }
  }

  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  return (
    <main className="reporter-page">
      <section className="reporter-shell" aria-label="Tracecase bug reporter">
        <header className="reporter-header">
          <div className="reporter-brand"><span className="brand-mark">T</span><span><strong>Tracecase</strong><small>Support</small></span></div>
          <div className="reporter-header-actions"><button className={`icon-button voice-toggle ${voiceReplies ? "voice-on" : ""}`} type="button" onClick={() => setVoiceReplies((value) => !value)} aria-label={voiceReplies ? "Turn voice replies off" : "Turn voice replies on"} aria-pressed={voiceReplies}><Icon name="volume" /></button>{embedded && <button className="icon-button reporter-close" type="button" onClick={closeReporter} aria-label="Close reporter"><Icon name="close" /></button>}</div>
        </header>

        {!configured ? <div className="reporter-unavailable"><Icon name="connections" size={24} /><h1>Reporter unavailable</h1><p>Missing project key.</p></div> : <>
          <div className="chat-stream" aria-live="polite">
            {messages.map((message) => <div className={`chat-message chat-${message.role}`} key={message.id}><span>{message.text}</span></div>)}
            {step === "sending" && <div className="chat-message chat-agent"><span className="typing-dots"><i /><i /><i /></span></div>}
          </div>

          <div className="reporter-controls">
            {(step === "observed" || step === "expected") && <div className="chat-composer"><textarea rows={2} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); acceptText(); } }} placeholder="Type a message" aria-label="Message" /><button className={`icon-button mic-button ${listening ? "listening" : ""}`} type="button" onClick={toggleListening} disabled={!getRecognition()} aria-label={listening ? "Stop listening" : "Speak message"}><Icon name="mic" /></button><button className="send-button" type="button" onClick={acceptText} disabled={!input.trim()} aria-label="Send message"><Icon name="arrow" /></button></div>}
            {step === "frequency" && <div className="reply-options">{[{ label: "Every time", value: "Every time" }, { label: "Sometimes", value: "Sometimes" }, { label: "Only once", value: "Only happened once" }, { label: "Not sure", value: "I don’t know" }].map((option) => <button key={option.value} onClick={() => chooseFrequency(option.value)}>{option.label}</button>)}</div>}
            {step === "consent" && <div className="consent-control"><label htmlFor="share-diagnostics" aria-label="Share browser diagnostics"><input id="share-diagnostics" type="checkbox" checked={diagnostics} onChange={(event) => setDiagnostics(event.target.checked)} /><span><strong>Browser diagnostics</strong><small>No passwords or cookies</small></span></label><button className="button primary" onClick={submit}>Send report</button></div>}
            {step === "error" && <button className="button primary" onClick={() => setStep("consent")}>Try again</button>}
            {step === "done" && <div className="report-complete"><span><Icon name="check" /></span><div><strong>Sent</strong><small>{reference}</small></div></div>}
          </div>
        </>}
        <footer className="reporter-footer"><span>Audio not stored by Tracecase.</span><span>Cookies never collected.</span></footer>
      </section>
    </main>
  );
}
