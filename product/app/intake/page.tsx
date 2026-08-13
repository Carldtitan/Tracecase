"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";

type Step = "observed" | "expected" | "frequency" | "followup" | "consent" | "sending" | "done" | "error";
type Message = { id: string; role: "agent" | "user"; text: string };
type Question = { field: string; question: string; reason: string };
type Attachment = { attachmentId: string; name: string; mimeType: string; bytes: number };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const prompts = {
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

function browserEnvironment() {
  return {
    browser: navigator.userAgent.includes("Firefox") ? "firefox" : navigator.userAgent.includes("AppleWebKit") && !navigator.userAgent.includes("Chrome") ? "webkit" : "chromium",
    viewport: { width: window.innerWidth, height: window.innerHeight },
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    featureFlags: {},
    source: "reported",
  };
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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [clarifications, setClarifications] = useState<Array<{ question: string; answer: string }>>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [reference, setReference] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const projectKey = searchParams.get("projectKey") ?? "";
  const pageRoute = searchParams.get("page") ?? "";
  const embedded = searchParams.get("embed") === "1";
  const configured = Boolean(projectKey);

  const origin = useCallback(() => document.referrer ? new URL(document.referrer).origin : window.location.origin, []);
  const currentPayload = useCallback((overrides: Record<string, unknown> = {}) => ({
    projectKey,
    sessionToken,
    expected,
    observed,
    frequency,
    route: pageRoute || undefined,
    environment: diagnostics ? browserEnvironment() : {},
    consent: { technicalDetails: diagnostics, screenshot: attachments.some((item) => item.mimeType.startsWith("image/")), attachments: attachments.length > 0 },
    unknowns: ["Session state", "Account state", "Feature flags"],
    attachmentIds: attachments.map((item) => item.attachmentId),
    clarifications,
    ...overrides,
  }), [attachments, clarifications, diagnostics, expected, frequency, observed, pageRoute, projectKey, sessionToken]);

  function closeReporter() {
    if (window.parent === window) return;
    window.parent.postMessage("tracecase:close", origin());
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

  async function loadFollowups(nextFrequency: string) {
    if (!sessionToken) { setStep("consent"); addAgent(prompts.consent); return; }
    try {
      const response = await fetch("/api/widget/questions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload({ frequency: nextFrequency })) });
      if (!response.ok) throw new Error("questions unavailable");
      const result = await response.json() as { questions: Question[] };
      const useful = result.questions.filter((item) => ![prompts.observed, prompts.expected, prompts.frequency].includes(item.question)).slice(0, 3);
      if (!useful.length) { setStep("consent"); addAgent(prompts.consent); return; }
      setQuestions(useful);
      setQuestionIndex(0);
      setStep("followup");
      addAgent(useful[0].question);
    } catch {
      setStep("consent");
      addAgent(prompts.consent);
    }
  }

  function acceptText() {
    const value = input.trim();
    if (!value) return;
    addUser(value);
    setInput("");
    if (step === "observed") { setObserved(value); setStep("expected"); addAgent(prompts.expected); return; }
    if (step === "expected") { setExpected(value); setStep("frequency"); addAgent(prompts.frequency); return; }
    if (step === "followup") {
      const current = questions[questionIndex];
      if (current) setClarifications((items) => [...items, { question: current.question, answer: value }]);
      const nextIndex = questionIndex + 1;
      if (nextIndex < questions.length) { setQuestionIndex(nextIndex); addAgent(questions[nextIndex].question); }
      else { setStep("consent"); addAgent(prompts.consent); }
    }
  }

  function chooseFrequency(value: string) {
    setFrequency(value);
    addUser(value);
    void loadFollowups(value);
  }

  function skipFollowup() {
    const current = questions[questionIndex];
    if (current) setClarifications((items) => [...items, { question: current.question, answer: "Reporter skipped this question." }]);
    const nextIndex = questionIndex + 1;
    if (nextIndex < questions.length) { setQuestionIndex(nextIndex); addAgent(questions[nextIndex].question); }
    else { setStep("consent"); addAgent(prompts.consent); }
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

  async function uploadFiles(files: FileList | File[]) {
    if (!sessionToken) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) {
        const form = new FormData();
        form.set("projectKey", projectKey);
        form.set("sessionToken", sessionToken);
        form.set("file", file);
        const response = await fetch("/api/widget/attachments", { method: "POST", body: form });
        if (!response.ok) throw new Error("upload failed");
        const attachment = await response.json() as Attachment;
        setAttachments((current) => [...current, attachment]);
      }
    } catch {
      addAgent("That file couldn’t be attached.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!sessionToken) return;
    const response = await fetch("/api/widget/attachments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectKey, sessionToken, attachmentId: attachment.attachmentId }) });
    if (response.ok) setAttachments((current) => current.filter((item) => item.attachmentId !== attachment.attachmentId));
  }

  async function submit() {
    setStep("sending");
    try {
      if (!sessionToken) throw new Error("session unavailable");
      const response = await fetch("/api/widget/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload()) });
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

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void fetch("/api/widget/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectKey, origin: origin() }) })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json() as Promise<{ token: string }>; })
      .then((session) => { if (active) setSessionToken(session.token); })
      .catch(() => { if (active) setStep("error"); });
    return () => { active = false; };
  }, [configured, origin, projectKey]);

  useEffect(() => {
    if (!sessionToken || (!observed && !expected && !clarifications.length && !attachments.length)) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/widget/draft", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload()) });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [attachments.length, clarifications.length, currentPayload, expected, observed, sessionToken]);

  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  const composing = step === "observed" || step === "expected" || step === "followup";
  return (
    <main className="reporter-page">
      <section className="reporter-shell" aria-label="Tracecase bug reporter">
        <header className="reporter-header">
          <div className="reporter-brand"><BrandMark /><span><strong>Tracecase</strong><small>Support</small></span></div>
          <div className="reporter-header-actions"><button className={`icon-button voice-toggle ${voiceReplies ? "voice-on" : ""}`} type="button" onClick={() => setVoiceReplies((value) => !value)} aria-label={voiceReplies ? "Turn voice replies off" : "Turn voice replies on"} aria-pressed={voiceReplies}><Icon name="volume" /></button>{embedded && <button className="icon-button reporter-close" type="button" onClick={closeReporter} aria-label="Close reporter"><Icon name="close" /></button>}</div>
        </header>

        {!configured ? <div className="reporter-unavailable"><Icon name="connections" size={24} /><h1>Reporter unavailable</h1><p>Missing project key.</p></div> : <>
          <div className="chat-stream" aria-live="polite">
            {messages.map((message) => <div className={`chat-message chat-${message.role}`} key={message.id}><span>{message.text}</span></div>)}
            {step === "sending" && <div className="chat-message chat-agent"><span className="typing-dots"><i /><i /><i /></span></div>}
          </div>

          {attachments.length > 0 && <div className="attachment-strip">{attachments.map((attachment) => <span key={attachment.attachmentId}><Icon name="attachment" size={13} /><b>{attachment.name}</b><button type="button" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.name}`}><Icon name="close" size={12} /></button></span>)}</div>}

          <div className="reporter-controls">
            {composing && <div className="chat-composer"><button className="icon-button attach-button" type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !sessionToken} aria-label="Attach screenshot or file"><Icon name="attachment" /></button><input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,text/plain,application/json" hidden onChange={(event) => event.target.files && void uploadFiles(event.target.files)} /><textarea rows={2} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); acceptText(); } }} placeholder="Type a message" aria-label="Message" /><button className={`icon-button mic-button ${listening ? "listening" : ""}`} type="button" onClick={toggleListening} disabled={!getRecognition()} aria-label={listening ? "Stop listening" : "Speak message"}><Icon name="mic" /></button><button className="send-button" type="button" onClick={acceptText} disabled={!input.trim()} aria-label="Send message"><Icon name="arrow" /></button>{step === "followup" && <button className="skip-question" type="button" onClick={skipFollowup}>Skip</button>}</div>}
            {step === "frequency" && <div className="reply-options">{[{ label: "Every time", value: "Every time" }, { label: "Sometimes", value: "Sometimes" }, { label: "Only once", value: "Only happened once" }, { label: "Not sure", value: "I don’t know" }].map((option) => <button key={option.value} onClick={() => chooseFrequency(option.value)}>{option.label}</button>)}</div>}
            {step === "consent" && <div className="consent-control"><label htmlFor="share-diagnostics" aria-label="Share browser diagnostics"><input id="share-diagnostics" type="checkbox" checked={diagnostics} onChange={(event) => setDiagnostics(event.target.checked)} /><span><strong>Browser diagnostics</strong><small>No passwords or cookies</small></span></label><div className="consent-actions"><button className="button secondary" type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !sessionToken}><Icon name="attachment" size={14} />{uploading ? "Uploading" : "Attach"}</button><button className="button primary" onClick={submit}>Send</button></div></div>}
            {step === "error" && <button className="button primary" onClick={() => setStep("consent")}>Try again</button>}
            {step === "done" && <div className="report-complete"><span><Icon name="check" /></span><div><strong>Sent</strong><small>{reference}</small></div></div>}
          </div>
        </>}
        <footer className="reporter-footer"><span>Audio is not stored.</span><span>Cookies are never collected.</span></footer>
      </section>
    </main>
  );
}
