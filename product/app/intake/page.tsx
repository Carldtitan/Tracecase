"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { Icon } from "../components/Icon";

type Step = "chat" | "review" | "sending" | "done" | "error";
type Message = { id: string; role: "agent" | "user"; text: string };
type Question = { field: string; question: string; reason: string };
type Attachment = { attachmentId: string; name: string; mimeType: string; bytes: number };
type ConversationState = {
  observed: string;
  expected: string;
  frequency: "Every time" | "Sometimes" | "Only happened once" | "I don’t know";
  clarifications: Array<{ question: string; answer: string }>;
};

const initialConversation: ConversationState = { observed: "", expected: "", frequency: "I don’t know", clarifications: [] };
const fileTypes = "image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.log,.csv";

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

function normalizedFrequency(value: string): ConversationState["frequency"] {
  const answer = value.toLowerCase();
  if (answer.includes("every") || answer.includes("always")) return "Every time";
  if (answer.includes("sometimes") || answer.includes("occasion")) return "Sometimes";
  if (answer.includes("once") || answer.includes("one time")) return "Only happened once";
  return "I don’t know";
}

export default function IntakePage() {
  return <Suspense fallback={<main className="reporter-page" />}><Reporter /></Suspense>;
}

function Reporter() {
  const [step, setStep] = useState<Step>("chat");
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<ConversationState>(initialConversation);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [diagnostics, setDiagnostics] = useState(true);
  const [messages, setMessages] = useState<Message[]>([{ id: "hello", role: "agent", text: "Hi — tell me what happened." }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [reference, setReference] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const searchParams = useSearchParams();
  const projectKey = searchParams.get("projectKey") ?? "";
  const pageRoute = searchParams.get("page") ?? "";
  const embedded = searchParams.get("embed") === "1";
  const configured = Boolean(projectKey);

  const origin = useCallback(() => document.referrer ? new URL(document.referrer).origin : window.location.origin, []);
  const currentPayload = useCallback((next: ConversationState = conversation) => ({
    projectKey,
    sessionToken,
    expected: next.expected,
    observed: next.observed,
    frequency: next.frequency,
    route: pageRoute || undefined,
    environment: diagnostics ? browserEnvironment() : {},
    consent: { technicalDetails: diagnostics, screenshot: attachments.some((item) => item.mimeType.startsWith("image/")), attachments: attachments.length > 0 },
    unknowns: ["Session state", "Account state", "Feature flags"],
    attachmentIds: attachments.map((item) => item.attachmentId),
    clarifications: next.clarifications,
  }), [attachments, conversation, diagnostics, pageRoute, projectKey, sessionToken]);

  function addAgent(text: string) {
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "agent", text }]);
  }

  function addUser(text: string) {
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text }]);
  }

  function finishQuestions() {
    setCurrentQuestion(null);
    setStep("review");
    addAgent("Thanks — I have enough to investigate. Add any screenshot or file, then send it.");
  }

  async function askNext(next: ConversationState, count = questionCount) {
    if (!sessionToken) return;
    setThinking(true);
    try {
      const response = await fetch("/api/widget/questions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload(next)) });
      if (!response.ok) throw new Error("questions unavailable");
      const result = await response.json() as { questions: Question[] };
      const question = result.questions[0];
      if (question && count < 4) {
        setCurrentQuestion(question);
        setQuestionCount(count + 1);
        addAgent(question.question);
        return;
      }
      if (!next.expected && count < 5) {
        const expectedQuestion = { field: "expected", question: "What should have happened instead?", reason: "expected_result_missing" };
        setCurrentQuestion(expectedQuestion);
        setQuestionCount(count + 1);
        addAgent(expectedQuestion.question);
        return;
      }
      finishQuestions();
    } catch {
      if (!next.expected) {
        const expectedQuestion = { field: "expected", question: "What should have happened instead?", reason: "expected_result_missing" };
        setCurrentQuestion(expectedQuestion);
        addAgent(expectedQuestion.question);
      } else {
        finishQuestions();
      }
    } finally {
      setThinking(false);
    }
  }

  function acceptText() {
    const value = input.trim();
    if (!value || thinking || step !== "chat") return;
    addUser(value);
    setInput("");
    let next = conversation;
    if (!conversation.observed) {
      next = { ...conversation, observed: value };
    } else if (currentQuestion) {
      const field = currentQuestion.field.toLowerCase();
      next = { ...conversation, clarifications: [...conversation.clarifications, { question: currentQuestion.question, answer: value }] };
      if (field.includes("expected") || field.includes("outcome") || field.includes("should")) next.expected = value;
      if (field.includes("frequency") || field.includes("often")) next.frequency = normalizedFrequency(value);
      if (field.includes("observed") && value !== conversation.observed) next.observed = `${conversation.observed}\n${value}`;
    }
    setConversation(next);
    setCurrentQuestion(null);
    void askNext(next);
  }

  function skipQuestion() {
    if (!currentQuestion || thinking) return;
    const next = {
      ...conversation,
      expected: currentQuestion.field.toLowerCase().includes("expected") && !conversation.expected ? "Reporter did not specify the expected behavior." : conversation.expected,
      clarifications: [...conversation.clarifications, { question: currentQuestion.question, answer: "Reporter skipped this question." }],
    };
    setConversation(next);
    setCurrentQuestion(null);
    void askNext(next);
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!sessionToken) return;
    setUploading(true);
    let added = 0;
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - attachments.length))) {
        const form = new FormData();
        form.set("projectKey", projectKey);
        form.set("sessionToken", sessionToken);
        form.set("file", file);
        const response = await fetch("/api/widget/attachments", { method: "POST", body: form });
        if (!response.ok) throw new Error("upload failed");
        const attachment = await response.json() as Attachment;
        setAttachments((items) => [...items, attachment]);
        added += 1;
      }
      if (added) addAgent(`${added} ${added === 1 ? "file" : "files"} attached.`);
    } catch {
      addAgent("I couldn’t attach that file. Use an image, PDF, text, Markdown, CSV, JSON, or log file under 4 MB.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(attachment: Attachment) {
    if (!sessionToken) return;
    const response = await fetch("/api/widget/attachments", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectKey, sessionToken, attachmentId: attachment.attachmentId }) });
    if (response.ok) setAttachments((items) => items.filter((item) => item.attachmentId !== attachment.attachmentId));
  }

  async function submit() {
    setStep("sending");
    try {
      if (!sessionToken || !conversation.observed || !conversation.expected) throw new Error("report incomplete");
      const response = await fetch("/api/widget/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload()) });
      if (!response.ok) throw new Error("report unavailable");
      const result = await response.json() as { caseId: string };
      setReference(result.caseId);
      setStep("done");
      addAgent("Sent. The investigation is starting now.");
    } catch {
      setStep("error");
      addAgent("I couldn’t send that. Try again.");
    }
  }

  function closeReporter() {
    if (window.parent !== window) window.parent.postMessage("tracecase:close", origin());
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
    if (!sessionToken || (!conversation.observed && !conversation.clarifications.length && !attachments.length)) return;
    const timer = window.setTimeout(() => { void fetch("/api/widget/draft", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(currentPayload()) }); }, 700);
    return () => window.clearTimeout(timer);
  }, [attachments.length, conversation, currentPayload, sessionToken]);

  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" }); }, [messages, thinking]);

  return (
    <main className="reporter-page">
      <section className="reporter-shell" aria-label="Tracecase support chat">
        <header className="reporter-header">
          <div className="reporter-brand"><BrandMark /><span><strong>Tracecase</strong><small>Support</small></span></div>
          {embedded && <button className="icon-button reporter-close" type="button" onClick={closeReporter} aria-label="Close support chat"><Icon name="close" /></button>}
        </header>

        {!configured ? <div className="reporter-unavailable"><Icon name="connections" size={24} /><h1>Chat unavailable</h1><p>Missing project key.</p></div> : <>
          <div className="chat-stream" ref={streamRef} aria-live="polite">
            {messages.map((message) => <div className={`chat-message chat-${message.role}`} key={message.id}><span>{message.text}</span></div>)}
            {thinking && <div className="chat-message chat-agent"><span className="typing-dots" aria-label="Tracecase is thinking"><i /><i /><i /></span></div>}
          </div>

          {attachments.length > 0 && <div className="attachment-strip">{attachments.map((attachment) => <span key={attachment.attachmentId}><Icon name="attachment" size={13} /><b>{attachment.name}</b><button type="button" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.name}`}><Icon name="close" size={12} /></button></span>)}</div>}

          <div className="reporter-controls">
            <input ref={fileRef} type="file" multiple accept={fileTypes} hidden onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />
            {(step === "chat" || step === "review") && <button className="upload-action" type="button" onClick={() => fileRef.current?.click()} disabled={uploading || !sessionToken}><Icon name="attachment" size={15} />{uploading ? "Adding…" : "Add image or file"}</button>}
            {step === "chat" && <div className="chat-composer"><textarea rows={2} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); acceptText(); } }} placeholder={conversation.observed ? "Type your answer" : "Describe what you saw"} aria-label="Message" disabled={thinking || !sessionToken} /><button className="send-button" type="button" onClick={acceptText} disabled={!input.trim() || thinking || !sessionToken} aria-label="Send message"><Icon name="arrow" /></button>{currentQuestion && <button className="skip-question" type="button" onClick={skipQuestion}>Skip</button>}</div>}
            {step === "review" && <div className="report-review"><label htmlFor="share-diagnostics"><input id="share-diagnostics" type="checkbox" checked={diagnostics} onChange={(event) => setDiagnostics(event.target.checked)} /><span><strong>Browser details</strong><small>Browser, screen, locale</small></span></label><button className="button primary" onClick={submit}>Send report</button></div>}
            {step === "sending" && <button className="button primary" disabled>Sending…</button>}
            {step === "error" && <button className="button primary" onClick={() => setStep(conversation.observed && conversation.expected ? "review" : "chat")}>Try again</button>}
            {step === "done" && <div className="report-complete"><span><Icon name="check" /></span><div><strong>Sent</strong><small>{reference}</small></div></div>}
          </div>
        </>}
      </section>
    </main>
  );
}
